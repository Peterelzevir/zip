//
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// Konfigurasi
const BOT_TOKEN = '7566921062:AAEyph6icSScdJTuYXhvJnWLFuRruF0VNDg'; // Ganti dengan token bot Anda
const IMGBB_API_KEY = 'acda84e3410cd744c9a9efeb98ebc154'; // Ganti dengan API key ImgBB Anda
const MAIN_ADMIN_ID = 5988451717; // Ganti dengan user ID admin utama

// Inisialisasi bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Inisialisasi database
const db = new sqlite3.Database('./bot_database.db');

// Buat tabel database
db.serialize(() => {
    // Tabel grup yang dikelola
    db.run(`CREATE TABLE IF NOT EXISTS managed_groups (
        group_id TEXT PRIMARY KEY,
        group_name TEXT,
        added_by INTEGER,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1
    )`);

    // Tabel admin bot
    db.run(`CREATE TABLE IF NOT EXISTS bot_admins (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        added_by INTEGER,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_main_admin INTEGER DEFAULT 0
    )`);

    // Tabel peringatan user
    db.run(`CREATE TABLE IF NOT EXISTS user_warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        group_id TEXT,
        warning_type TEXT,
        warning_reason TEXT,
        warning_count INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabel pembatasan user
    db.run(`CREATE TABLE IF NOT EXISTS user_restrictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        group_id TEXT,
        restriction_type TEXT,
        restriction_until DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabel log aktivitas
    db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT,
        user_id INTEGER,
        action_type TEXT,
        action_details TEXT,
        ai_response TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabel pengaturan
    db.run(`CREATE TABLE IF NOT EXISTS bot_settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    // Insert admin utama
    db.run(`INSERT OR IGNORE INTO bot_admins (user_id, username, is_main_admin) VALUES (?, 'main_admin', 1)`, [MAIN_ADMIN_ID]);
    
    // Insert pengaturan default
    db.run(`INSERT OR IGNORE INTO bot_settings (key, value) VALUES ('detection_enabled', 'true')`);
});

// Custom prompt untuk AI
const AI_SYSTEM_PROMPT = `Kamu adalah AI moderator grup Telegram yang sangat ketat dan tegas dalam menjaga keamanan grup. 

TUGAS UTAMA:
- Analisis setiap pesan dan gambar untuk mendeteksi konten tidak pantas
- Berikan keputusan tegas untuk menjaga keamanan grup
- Deteksi konten 18+, SARA, spam, toxic, bullying, atau konten berbahaya lainnya

KEPUTUSAN YANG BISA DIAMBIL:
1. DELETE_MESSAGE - Hapus pesan yang tidak pantas
2. WARN_USER - Beri peringatan ke user
3. RESTRICT_USER - Batasi user (mute) dengan durasi tertentu
4. KICK_USER - Keluarkan user dari grup
5. BAN_USER - Ban user permanent
6. ALLOW - Izinkan pesan (jika aman)

FORMAT RESPONSE JSON:
{
  "action": "DELETE_MESSAGE|WARN_USER|RESTRICT_USER|KICK_USER|BAN_USER|ALLOW",
  "reason": "alasan detail kenapa mengambil keputusan ini",
  "severity": "LOW|MEDIUM|HIGH|CRITICAL",
  "duration": "jika restrict, berapa lama? (contoh: 1h, 24h, 7d)",
  "warning_message": "pesan peringatan untuk user"
}

ATURAN KETAT:
- Gambar/foto bugil, telanjang, atau 18+ = BAN_USER
- Konten SARA, hate speech = KICK_USER  
- Spam berlebihan = RESTRICT_USER
- Bahasa kasar/toxic = WARN_USER
- Link mencurigakan = DELETE_MESSAGE
- Konten kekerasan = BAN_USER
- Jika user sudah dapat 3 peringatan = KICK_USER

SELALU TEGAS DAN PROTEKTIF!`;

// Fungsi upload gambar ke ImgBB
async function uploadToImgBB(imagePath) {
    try {
        const form = new FormData();
        form.append('image', fs.createReadStream(imagePath));
        
        const response = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, form, {
            headers: form.getHeaders()
        });
        
        return response.data.data.url;
    } catch (error) {
        console.error('Error uploading to ImgBB:', error);
        return null;
    }
}

// Fungsi analisis AI
async function analyzeWithAI(text, imageUrl = null, groupId) {
    try {
        const sessionId = `group_${groupId}`;
        const fullPrompt = `${AI_SYSTEM_PROMPT}\n\nAnalisis konten berikut:\n${text}`;
        
        let apiUrl;
        if (imageUrl) {
            apiUrl = `https://api.fasturl.link/aillm/gpt-4o-turbo?ask=${encodeURIComponent(fullPrompt)}&imageUrl=${encodeURIComponent(imageUrl)}&sessionId=${sessionId}`;
        } else {
            apiUrl = `https://api.fasturl.link/aillm/gpt-4o-turbo?ask=${encodeURIComponent(fullPrompt)}&sessionId=${sessionId}`;
        }
        
        const response = await axios.get(apiUrl);
        return response.data.result;
    } catch (error) {
        console.error('Error analyzing with AI:', error);
        return null;
    }
}

// Fungsi cek apakah user adalah admin bot
function isAdminBot(userId) {
    return new Promise((resolve) => {
        db.get(`SELECT * FROM bot_admins WHERE user_id = ?`, [userId], (err, row) => {
            resolve(!!row);
        });
    });
}

// Fungsi cek apakah grup dikelola
function isManagedGroup(groupId) {
    return new Promise((resolve) => {
        db.get(`SELECT * FROM managed_groups WHERE group_id = ? AND is_active = 1`, [groupId], (err, row) => {
            resolve(!!row);
        });
    });
}

// Fungsi cek apakah deteksi aktif
function isDetectionEnabled() {
    return new Promise((resolve) => {
        db.get(`SELECT value FROM bot_settings WHERE key = 'detection_enabled'`, [], (err, row) => {
            resolve(row ? row.value === 'true' : false);
        });
    });
}

// Fungsi tambah peringatan
function addWarning(userId, groupId, type, reason) {
    return new Promise((resolve) => {
        db.run(`INSERT INTO user_warnings (user_id, group_id, warning_type, warning_reason) VALUES (?, ?, ?, ?)`,
            [userId, groupId, type, reason], function(err) {
                if (!err) {
                    // Cek total peringatan
                    db.get(`SELECT COUNT(*) as count FROM user_warnings WHERE user_id = ? AND group_id = ?`,
                        [userId, groupId], (err, row) => {
                            resolve(row ? row.count : 0);
                        });
                } else {
                    resolve(0);
                }
            });
    });
}

// Fungsi log aktivitas
function logActivity(groupId, userId, actionType, actionDetails, aiResponse) {
    db.run(`INSERT INTO activity_logs (group_id, user_id, action_type, action_details, ai_response) VALUES (?, ?, ?, ?, ?)`,
        [groupId, userId, actionType, actionDetails, JSON.stringify(aiResponse)]);
}

// Fungsi eksekusi keputusan AI
async function executeAIDecision(msg, aiDecision) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const messageId = msg.message_id;

    try {
        const decision = JSON.parse(aiDecision);
        
        switch (decision.action) {
            case 'DELETE_MESSAGE':
                await bot.deleteMessage(chatId, messageId);
                await bot.sendMessage(chatId, `⚠️ Pesan dihapus karena: ${decision.reason}`, {
                    reply_to_message_id: messageId
                });
                break;

            case 'WARN_USER':
                const warningCount = await addWarning(userId, chatId, 'WARNING', decision.reason);
                await bot.sendMessage(chatId, 
                    `⚠️ PERINGATAN (${warningCount}/3)\n` +
                    `User: @${msg.from.username || msg.from.first_name}\n` +
                    `Alasan: ${decision.reason}\n` +
                    `${decision.warning_message || ''}`, 
                    { reply_to_message_id: messageId });
                
                if (warningCount >= 3) {
                    await bot.kickChatMember(chatId, userId);
                    await bot.sendMessage(chatId, `🚫 User @${msg.from.username || msg.from.first_name} dikeluarkan karena mencapai 3 peringatan!`);
                }
                break;

            case 'RESTRICT_USER':
                const restrictUntil = new Date();
                const duration = decision.duration || '1h';
                
                if (duration.includes('h')) {
                    restrictUntil.setHours(restrictUntil.getHours() + parseInt(duration));
                } else if (duration.includes('d')) {
                    restrictUntil.setDate(restrictUntil.getDate() + parseInt(duration));
                }
                
                await bot.restrictChatMember(chatId, userId, {
                    until_date: Math.floor(restrictUntil.getTime() / 1000),
                    can_send_messages: false
                });
                
                await bot.sendMessage(chatId, 
                    `🔇 User @${msg.from.username || msg.from.first_name} dibatasi selama ${duration}\n` +
                    `Alasan: ${decision.reason}`);
                break;

            case 'KICK_USER':
                await bot.kickChatMember(chatId, userId);
                await bot.unbanChatMember(chatId, userId);
                await bot.sendMessage(chatId, 
                    `🚫 User @${msg.from.username || msg.from.first_name} dikeluarkan!\n` +
                    `Alasan: ${decision.reason}`);
                break;

            case 'BAN_USER':
                await bot.kickChatMember(chatId, userId);
                await bot.sendMessage(chatId, 
                    `⛔ User @${msg.from.username || msg.from.first_name} di-ban permanent!\n` +
                    `Alasan: ${decision.reason}`);
                break;

            case 'ALLOW':
                // Tidak ada aksi, pesan diizinkan
                break;
        }

        logActivity(chatId, userId, decision.action, decision.reason, decision);
    } catch (error) {
        console.error('Error executing AI decision:', error);
    }
}

// Handler pesan grup
bot.on('message', async (msg) => {
    if (msg.chat.type === 'private') return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Cek apakah grup dikelola dan deteksi aktif
    const isManaged = await isManagedGroup(chatId);
    const detectionEnabled = await isDetectionEnabled();

    if (!isManaged || !detectionEnabled) return;

    let textToAnalyze = msg.text || msg.caption || '';
    let imageUrl = null;

    // Jika ada foto, upload ke ImgBB
    if (msg.photo) {
        try {
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            const file = await bot.getFile(fileId);
            const filePath = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            
            // Download dan upload ke ImgBB
            const response = await axios.get(filePath, { responseType: 'stream' });
            const localPath = `./temp_${Date.now()}.jpg`;
            
            response.data.pipe(fs.createWriteStream(localPath));
            
            response.data.on('end', async () => {
                imageUrl = await uploadToImgBB(localPath);
                fs.unlinkSync(localPath); // Hapus file sementara
                
                // Analisis dengan AI
                const aiResponse = await analyzeWithAI(textToAnalyze, imageUrl, chatId);
                if (aiResponse) {
                    await executeAIDecision(msg, aiResponse);
                }
            });
        } catch (error) {
            console.error('Error processing photo:', error);
        }
    } else if (textToAnalyze) {
        // Analisis teks saja
        const aiResponse = await analyzeWithAI(textToAnalyze, null, chatId);
        if (aiResponse) {
            await executeAIDecision(msg, aiResponse);
        }
    }
});

// Handler bot baru dimasukkan ke grup
bot.on('new_chat_members', async (msg) => {
    const chatId = msg.chat.id;
    const newMembers = msg.new_chat_members;
    
    // Cek apakah bot yang dimasukkan
    const botAdded = newMembers.some(member => member.id == bot.options.chatId);
    if (!botAdded) return;

    const inviterId = msg.from.id;
    const isAdmin = await isAdminBot(inviterId);
    const isManaged = await isManagedGroup(chatId);

    if (!isAdmin || !isManaged) {
        await bot.sendMessage(chatId, 
            '❌ Bot tidak memiliki izin untuk beroperasi di grup ini.\n' +
            'Silakan hubungi admin bot untuk mendapatkan akses.');
        await bot.leaveChat(chatId);
        return;
    }

    // Cek apakah bot adalah admin grup
    try {
        const chatMember = await bot.getChatMember(chatId, bot.options.chatId);
        if (chatMember.status !== 'administrator') {
            await bot.sendMessage(chatId, 
                '⚠️ Bot tidak dijadikan admin grup.\n' +
                'Bot mungkin tidak dapat bekerja secara maksimal.\n' +
                'Silakan jadikan bot sebagai admin untuk performa optimal.');
        } else {
            await bot.sendMessage(chatId, 
                '✅ Bot berhasil diaktifkan dan siap melindungi grup!\n' +
                '🤖 AI Protection System: AKTIF\n' +
                '🛡️ Semua pesan akan dimonitor untuk keamanan grup.');
        }
    } catch (error) {
        console.error('Error checking bot admin status:', error);
    }
});

// Inline keyboard untuk admin
const adminKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '➕ Tambah Grup', callback_data: 'add_group' },
                { text: '➖ Hapus Grup', callback_data: 'del_group' }
            ],
            [
                { text: '🔍 Deteksi ON', callback_data: 'detection_on' },
                { text: '🔍 Deteksi OFF', callback_data: 'detection_off' }
            ],
            [
                { text: '📋 List Grup', callback_data: 'list_groups' },
                { text: '👥 Tambah Admin', callback_data: 'add_admin' }
            ],
            [
                { text: '📊 Statistik', callback_data: 'statistics' },
                { text: '🗑️ Hapus Admin', callback_data: 'del_admin' }
            ]
        ]
    }
};

// Command /start untuk admin
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (msg.chat.type !== 'private') return;

    const isAdmin = await isAdminBot(userId);
    if (!isAdmin) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses ke bot ini.');
        return;
    }

    await bot.sendMessage(chatId, 
        '🤖 *Bot AI Group Protection*\n\n' +
        '✅ Sistem proteksi grup otomatis dengan AI\n' +
        '🛡️ Deteksi konten tidak pantas secara real-time\n' +
        '⚡ Pengambilan keputusan otomatis dan cepat\n\n' +
        'Pilih menu di bawah:', 
        { ...adminKeyboard, parse_mode: 'Markdown' });
});

// Handler callback query
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    const isAdmin = await isAdminBot(userId);
    if (!isAdmin) {
        await bot.answerCallbackQuery(query.id, { text: 'Akses ditolak!' });
        return;
    }

    switch (data) {
        case 'add_group':
            await bot.sendMessage(chatId, 
                '➕ *Tambah Grup*\n\n' +
                'Forward pesan dari grup yang ingin ditambahkan atau kirim Group ID:', 
                { parse_mode: 'Markdown' });
            break;

        case 'del_group':
            db.all(`SELECT * FROM managed_groups WHERE is_active = 1`, [], (err, rows) => {
                if (rows.length === 0) {
                    bot.sendMessage(chatId, 'Tidak ada grup yang dikelola.');
                    return;
                }

                let keyboard = [];
                rows.forEach(row => {
                    keyboard.push([{ text: row.group_name, callback_data: `remove_${row.group_id}` }]);
                });

                bot.sendMessage(chatId, 'Pilih grup yang ingin dihapus:', {
                    reply_markup: { inline_keyboard: keyboard }
                });
            });
            break;

        case 'detection_on':
            db.run(`UPDATE bot_settings SET value = 'true' WHERE key = 'detection_enabled'`);
            await bot.sendMessage(chatId, '🔍 Deteksi AI diaktifkan di semua grup!');
            break;

        case 'detection_off':
            db.run(`UPDATE bot_settings SET value = 'false' WHERE key = 'detection_enabled'`);
            await bot.sendMessage(chatId, '🔍 Deteksi AI dinonaktifkan di semua grup!');
            break;

        case 'list_groups':
            db.all(`SELECT * FROM managed_groups WHERE is_active = 1`, [], (err, rows) => {
                if (rows.length === 0) {
                    bot.sendMessage(chatId, 'Tidak ada grup yang dikelola.');
                    return;
                }

                let message = '📋 *Daftar Grup yang Dikelola:*\n\n';
                rows.forEach((row, index) => {
                    message += `${index + 1}. ${row.group_name}\n`;
                    message += `   ID: \`${row.group_id}\`\n`;
                    message += `   Ditambahkan: ${new Date(row.added_at).toLocaleDateString('id-ID')}\n\n`;
                });

                bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            });
            break;

        case 'add_admin':
            await bot.sendMessage(chatId, 
                '👥 *Tambah Admin*\n\n' +
                'Forward pesan dari user yang ingin dijadikan admin atau kirim User ID:', 
                { parse_mode: 'Markdown' });
            break;

        case 'statistics':
            // Ambil statistik dari database
            db.all(`SELECT action_type, COUNT(*) as count FROM activity_logs WHERE date(created_at) = date('now') GROUP BY action_type`, [], (err, todayStats) => {
                db.all(`SELECT COUNT(*) as total_warnings FROM user_warnings WHERE date(created_at) = date('now')`, [], (err, warningStats) => {
                    db.all(`SELECT COUNT(*) as total_groups FROM managed_groups WHERE is_active = 1`, [], (err, groupStats) => {
                        
                        let message = '📊 *Statistik Bot Hari Ini:*\n\n';
                        message += `🏢 Total Grup Dikelola: ${groupStats[0].total_groups}\n`;
                        message += `⚠️ Total Peringatan: ${warningStats[0].total_warnings}\n\n`;
                        message += '*Aksi Hari Ini:*\n';
                        
                        if (todayStats.length === 0) {
                            message += 'Belum ada aktivitas hari ini.\n';
                        } else {
                            todayStats.forEach(stat => {
                                const emoji = {
                                    'DELETE_MESSAGE': '🗑️',
                                    'WARN_USER': '⚠️',
                                    'RESTRICT_USER': '🔇',
                                    'KICK_USER': '🚫',
                                    'BAN_USER': '⛔'
                                };
                                message += `${emoji[stat.action_type] || '🤖'} ${stat.action_type}: ${stat.count}\n`;
                            });
                        }

                        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
                    });
                });
            });
            break;

        case 'del_admin':
            db.all(`SELECT * FROM bot_admins WHERE is_main_admin = 0`, [], (err, rows) => {
                if (rows.length === 0) {
                    bot.sendMessage(chatId, 'Tidak ada admin yang dapat dihapus.');
                    return;
                }

                let keyboard = [];
                rows.forEach(row => {
                    keyboard.push([{ text: row.username || `User ${row.user_id}`, callback_data: `remove_admin_${row.user_id}` }]);
                });

                bot.sendMessage(chatId, 'Pilih admin yang ingin dihapus:', {
                    reply_markup: { inline_keyboard: keyboard }
                });
            });
            break;

        default:
            if (data.startsWith('remove_')) {
                const groupId = data.replace('remove_', '');
                db.run(`UPDATE managed_groups SET is_active = 0 WHERE group_id = ?`, [groupId]);
                await bot.sendMessage(chatId, '✅ Grup berhasil dihapus dari daftar kelola!');
            } else if (data.startsWith('remove_admin_')) {
                const adminId = data.replace('remove_admin_', '');
                db.run(`DELETE FROM bot_admins WHERE user_id = ? AND is_main_admin = 0`, [adminId]);
                await bot.sendMessage(chatId, '✅ Admin berhasil dihapus!');
            }
            break;
    }

    await bot.answerCallbackQuery(query.id);
});

// Handler untuk menambah grup via forward message
bot.on('message', async (msg) => {
    if (msg.chat.type !== 'private') return;
    if (!msg.forward_from_chat) return;

    const userId = msg.from.id;
    const isAdmin = await isAdminBot(userId);
    if (!isAdmin) return;

    const groupId = msg.forward_from_chat.id;
    const groupName = msg.forward_from_chat.title;

    db.run(`INSERT OR REPLACE INTO managed_groups (group_id, group_name, added_by) VALUES (?, ?, ?)`,
        [groupId, groupName, userId], (err) => {
            if (!err) {
                bot.sendMessage(msg.chat.id, `✅ Grup "${groupName}" berhasil ditambahkan ke daftar kelola!`);
            } else {
                bot.sendMessage(msg.chat.id, '❌ Gagal menambahkan grup!');
            }
        });
});

// Laporan harian otomatis
cron.schedule('0 8 * * *', () => {
    db.all(`SELECT user_id FROM bot_admins`, [], (err, admins) => {
        if (err) return;

        // Ambil statistik kemarin
        db.all(`SELECT action_type, COUNT(*) as count FROM activity_logs WHERE date(created_at) = date('now', '-1 day') GROUP BY action_type`, [], (err, stats) => {
            db.all(`SELECT COUNT(*) as total_warnings FROM user_warnings WHERE date(created_at) = date('now', '-1 day')`, [], (err, warnings) => {
                
                let report = '📊 *Laporan Harian Bot AI Protection*\n\n';
                report += `📅 Tanggal: ${new Date().toLocaleDateString('id-ID')}\n`;
                report += `⚠️ Total Peringatan: ${warnings[0].total_warnings}\n\n`;
                report += '*Aksi yang Diambil:*\n';
                
                if (stats.length === 0) {
                    report += 'Tidak ada aktivitas kemarin.\n';
                } else {
                    stats.forEach(stat => {
                        const emoji = {
                            'DELETE_MESSAGE': '🗑️',
                            'WARN_USER': '⚠️',
                            'RESTRICT_USER': '🔇',
                            'KICK_USER': '🚫',
                            'BAN_USER': '⛔'
                        };
                        report += `${emoji[stat.action_type] || '🤖'} ${stat.action_type}: ${stat.count}\n`;
                    });
                }

                report += '\n🛡️ Bot terus menjaga keamanan grup Anda!';

                admins.forEach(admin => {
                    bot.sendMessage(admin.user_id, report, { parse_mode: 'Markdown' });
                });
            });
        });
    });
});

// Error handler
bot.on('error', (error) => {
    console.error('Bot error:', error);
});

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

console.log('🤖 Bot AI Group Protection telah aktif!');
console.log('📊 Database initialized');
console.log('🛡️ Protection system ready');

// Proses shutdown yang bersih
process.on('SIGINT', () => {
    console.log('\n🔄 Shutting down bot...');
    db.close();
    process.exit(0);
});
