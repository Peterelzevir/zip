const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

// === CONFIG ===
const BOT_TOKEN = '7566921062:AAEyph6icSScdJTuYXhvJnWLFuRruF0VNDg';
const ADMIN_UTAMA_ID = 5988451717;
const IMGBB_API_KEY = 'acda84e3410cd744c9a9efeb98ebc154';
const API_AI_ENDPOINT = 'https://api.fasturl.link/aillm/gpt-4o-turbo';
const MODERATION_PROMPT = `
Kamu adalah AI moderator grup Telegram. Tugasmu:
- Deteksi pelanggaran: spam, SARA, NSFW, kekerasan, dll
- Berikan keputusan: hapus_pesan | peringatan | kick | ban | batasi | biarkan

Balas dengan:
{
  "result": {
    "tindakan": "peringatan",
    "alasan": "Caption mengandung konten kekerasan",
    "target": "@username"
  }
}

Pesan berikut:
`;


// === DATABASE INIT ===
const dbPath = path.join(__dirname, 'database.sqlite');
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, '');
const db = new sqlite3.Database(dbPath);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS allowed_groups (group_id INTEGER PRIMARY KEY, group_name TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS sessions (group_id INTEGER PRIMARY KEY, session TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS admins (user_id INTEGER PRIMARY KEY, is_owner INTEGER DEFAULT 0)`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT, user_id INTEGER, group_id INTEGER, action TEXT, reason TEXT)`);
  // setting proteksi default ON
  db.run(`INSERT OR IGNORE INTO settings (k, v) VALUES ('proteksi_on', '1')`);
});

// === BOT & UTILS ===
const bot = new Telegraf(BOT_TOKEN);
const getDisplayName = u => u.username ? '@'+u.username : u.first_name;

async function getSetting(k) {
  return new Promise(res => {
    db.get(`SELECT v FROM settings WHERE k=?`, [k], (e, r) => res(r?.v));
  });
}

function setSetting(k, v) {
  db.run(`INSERT OR REPLACE INTO settings (k,v) VALUES (?,?)`, [k, v]);
}

function getSession(groupId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT session FROM sessions WHERE group_id=?`, [groupId], (e, r) => {
      if(r) return resolve(r.session);
      const s = 'grup-'+groupId;
      db.run(`INSERT INTO sessions (group_id, session) VALUES (?,?)`, [groupId, s], e => e ? reject(e) : resolve(s));
    });
  });
}

async function processAI(prompt, session, imageUrl=null) {
  const params = new URLSearchParams({ ask: prompt, sessionId: session });
  if(imageUrl) params.append('imageUrl', imageUrl);
  const res = await axios.get(`${API_AI_ENDPOINT}?${params.toString()}`);
  return res.data.result||null;
}

async function uploadImageToImgbb(url) {
  const res = await axios.post('https://api.imgbb.com/1/upload', null, {
    params: { key: IMGBB_API_KEY, image: url }
  });
  return res.data.data.url;
}

function logAction(user_id, group_id, action, reason) {
  db.run(`INSERT INTO logs (timestamp,user_id,group_id,action,reason) VALUES (?,?,?,?,?)`, [
    new Date().toISOString(), user_id, group_id, action, reason
  ]);
}

// === ACTIONS ===
async function ambilTindakan(ctx, keputusan, targetId) {
  const { tindakan, alasan, target } = keputusan;
  const tn = tindakan, al = alasan||'alasannya tidak disebutkan';
  const g = ctx.chat.id, u = targetId;
  try {
    if(tn==='hapus_pesan') await ctx.deleteMessage(ctx.message.message_id);
    if(tn==='peringatan') await ctx.reply(`⚠️ Peringatan untuk ${target || getDisplayName(ctx.message.from)}:\n${al}`);
    if(tn==='kick') { await ctx.kickChatMember(u); await ctx.reply(`👢 ${target} dikeluarkan. Alasan: ${al}`); }
    if(tn==='ban') { await ctx.banChatMember(u); await ctx.reply(`🚫 ${target} dibanned. Alasan: ${al}`); }
    if(tn==='batasi') {
      const until = Math.floor(Date.now()/1000)+2*86400;
      await ctx.restrictChatMember(u,{ can_send_messages:false, until_date:until });
      await ctx.reply(`🔇 ${target} dibatasi 2 hari. Alasan: ${al}`);
    }
    logAction(u, g, tn, al);
  } catch(e){ console.error(e); }
}

// === HANDLING MESSAGE ===
bot.on('message', async ctx => {
  const chat = ctx.chat, me = ctx.botInfo;
  const isGroup = ['group','supergroup'].includes(chat.type);
  if(!isGroup) return;

  const row = await new Promise(r=>db.get(`SELECT * FROM allowed_groups WHERE group_id=?`, [chat.id], (_,d)=>r(d)));
  if(!row) {
    await ctx.replyWithMarkdown(`
🚫 **AKSES DITOLAK - UNAUTHORIZED ACCESS**

🛡️ Bot keamanan premium ini hanya beroperasi di grup yang terdaftar dalam whitelist.

📞 **Hubungi owner untuk mendaftarkan grup:**
• Kirim ID grup ini ke owner
• Tunggu konfirmasi registrasi
• Setelah terdaftar, proteksi akan aktif

🔒 **Unauthorized access detected!**
🚪 Bot akan keluar dalam 10 detik...

*🇮🇩 Made in Indonesia - Premium Security System*
    `);
    setTimeout(()=>ctx.leaveChat(),10000);
    return;
  }

  const member = await ctx.telegram.getChatMember(chat.id, me.id);
  if(!member.can_restrict_members) {
    ctx.replyWithMarkdown(`⚠️ **PERINGATAN BOT TIDAK ADMIN**\nSaya belum memiliki akses admin penuh, **tidak bisa lakukan proteksi maksimal.**`);
  }

  const on = await getSetting('proteksi_on');
  if(on!=='1') return; // proteksi off

  const session = await getSession(chat.id);
  const pesan = ctx.message.text||ctx.message.caption||'';
  let img = null;
  if(ctx.message.photo){
    const file = await ctx.telegram.getFileLink(ctx.message.photo.pop().file_id);
    img = await uploadImageToImgbb(file.href);
  }
  const prompt = `${MODERATION_PROMPT}\nUser: ${getDisplayName(ctx.message.from)}\nPesan: ${pesan}`;
  const result = await processAI(prompt, session, img);
  if(result?.tindakan) ambilTindakan(ctx, result, ctx.message.from.id);
});

// === INLINE ADMIN PANEL ===
bot.command('panel', async ctx => {
  const uid = ctx.from.id;
  if(uid!==ADMIN_UTAMA_ID && !await new Promise(r=>db.get(`SELECT * FROM admins WHERE user_id=?`, [uid], (_,d)=>r(!!d)))) {
    return ctx.reply('❌ Anda bukan admin.');
  }

  const protek = await getSetting('proteksi_on');
  const btns = [
    [Markup.button.callback('📋 List Grup','LIST')],
    [Markup.button.callback('🗑️ Hapus Grup','DELMENU')],
    [Markup.button.callback(protek==='1'?'🔓 Proteksi: ON':'🔒 Proteksi: OFF','TOGGLE')],
    [Markup.button.callback('➕ Tambah Admin','ADDADM'),Markup.button.callback('🗑️ Hapus Admin','DELADM')],
  ];
  ctx.reply('🔧 *Admin Panel*', Markup.inlineKeyboard(btns)).then(()=>{});
});

// handle actions
bot.action('LIST', ctx=>{
  db.all(`SELECT * FROM allowed_groups`, (_,rows)=>{
    const t = rows.length?rows.map(r=>`• ${r.group_name} (ID:${r.group_id})`).join('\n'):'_-- tidak ada data --_';
    ctx.editMessageMarkdown(`📋 *Grup Terdaftar:*\n${t}`);
  });
});

bot.action('DELMENU', ctx=>{
  db.all(`SELECT * FROM allowed_groups`, (_,rows)=>{
    if(!rows.length)return ctx.editMessageText('Tidak ada grup.');
    ctx.editMessageText('🗑️ Pilih grup untuk dihapus:',Markup.inlineKeyboard(rows.map(r=>Markup.button.callback(r.group_name,`CONF_${r.group_id}`))));
  });
});

bot.action(/CONF_(\d+)/, ctx=>{
  const id = ctx.match[1];
  ctx.editMessageText(`Yakin ingin hapus grup ID ${id}?`,
    Markup.inlineKeyboard([
      Markup.button.callback('✅ Ya','DODEL_'+id),
      Markup.button.callback('❌ Batal','DELMENU')
    ])
  );
});

bot.action(/DODEL_(\d+)/, ctx=>{
  const id = ctx.match[1];
  db.run(`DELETE FROM allowed_groups WHERE group_id=?`,[id]);
  ctx.editMessageText('✅ Grup berhasil dihapus.');
});

bot.action('TOGGLE', async ctx=>{
  const v = await getSetting('proteksi_on');
  const nv = v==='1'?'0':'1';
  setSetting('proteksi_on', nv);
  ctx.editMessageText(nv==='1'?'✅ Proteksi DI-AKTIFKAN':'⚠️ Proteksi DIMATIKAN');
});

bot.action('ADDADM', ctx=>{
  ctx.reply('Balas pesan user yang ingin dijadikan admin.');
  bot.once('message', msg => {
    if(!msg.reply_to_message) return msg.reply('❌ Harus balas pesan user.');
    const uid = msg.from.id;
    if(uid!==ADMIN_UTAMA_ID) return msg.reply('❌ Hanya owner bisa tambahkan admin.');
    const t = msg.reply_to_message.from;
    db.run(`INSERT OR IGNORE INTO admins (user_id) VALUES (?)`,[t.id]);
    msg.reply(`✅ ${getDisplayName(t)} berhasil ditambahkan admin.`);
  });
});

bot.action('DELADM', ctx=>{
  ctx.reply('Balas pesan admin yang ingin dihapus.');
  bot.once('message', msg => {
    if(!msg.reply_to_message) return msg.reply('❌ Harus balas pesan.');
    const uid = msg.from.id;
    const t = msg.reply_to_message.from;
    if(uid!==ADMIN_UTAMA_ID) return msg.reply('❌ Hanya owner bisa hapus admin.');
    if(t.id===ADMIN_UTAMA_ID) return msg.reply('❌ Tidak bisa hapus owner.');
    db.run(`DELETE FROM admins WHERE user_id=?`,[t.id]);
    msg.reply(`✅ ${getDisplayName(t)} berhasil dihapus dari admin.`);
  });
});

// === DAILY REPORT ===
cron.schedule('59 23 * * *', ()=>{
  db.all(`SELECT * FROM logs WHERE timestamp >= date('now','-1 day')`, async (_,rows)=>{
    if(!rows.length) return bot.telegram.sendMessage(ADMIN_UTAMA_ID,'📋 Tidak ada aktivitas hari ini.');
    let m = `📊 *Laporan Harian*\nTanggal: ${new Date().toLocaleDateString()}\nTotal: ${rows.length}\n\n`;
    rows.forEach((l,i)=>{
      m+=`${i+1}. 🧍ID:${l.user_id}\n🔄 Grup:${l.group_id}\n⚠️ ${l.action}: ${l.reason}\n\n`;
    });
    bot.telegram.sendMessage(ADMIN_UTAMA_ID,m,{parse_mode:'Markdown'});
  });
});

// === START BOT ===
bot.launch();
console.log('✅ Bot premium siap dan proteksi!');
