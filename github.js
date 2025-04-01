const { Telegraf, Markup, Scenes, session } = require('telegraf');
const AdmZip = require('adm-zip');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
// Bot configuration - Masukkan token bot Telegram dari BotFather di sini
const BOT_TOKEN = '7332933814:AAGm2mbyQM6UyMQGggJyXbRsAgESv5c1uk8';
const bot = new Telegraf(BOT_TOKEN);

// Daftar ID Telegram user yang bisa menggunakan bot (admin)
// Contoh: [123456789, 987654321]
const ADMIN_IDS = [5988451717]; // Ganti dengan ID Telegram admin
const tempDir = path.join(os.tmpdir(), 'telegram-zip-github-bot');

// Create temp directory if it doesn't exist
try {
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
} catch (error) {
  console.error('Error creating temp directory:', error);
}

// Middleware to check if user is admin
const isAdmin = (ctx, next) => {
  if (ADMIN_IDS.includes(ctx.from.id)) {
    return next();
  }
  return ctx.reply('⛔ Maaf, hanya admin yang dapat menggunakan bot ini.');
};

// Setup scenes for workflow
const { BaseScene } = Scenes;

// Scene for GitHub credentials
const githubCredentialsScene = new BaseScene('github_credentials');
githubCredentialsScene.enter((ctx) => {
  return ctx.reply(
    '🔐 Masukkan kredensial GitHub Anda dalam format berikut:\n\nUsername: your_username\nToken: your_personal_access_token\nRepo: owner/repository',
    Markup.inlineKeyboard([
      Markup.button.callback('❌ Batal', 'cancel')
    ])
  );
});

githubCredentialsScene.on('text', async (ctx) => {
  const text = ctx.message.text;
  const lines = text.split('\n');
  
  // Check if format is correct
  if (lines.length < 3) {
    return ctx.reply(
      '❌ Format tidak valid. Gunakan format:\n\nUsername: your_username\nToken: your_personal_access_token\nRepo: owner/repository',
      Markup.inlineKeyboard([
        Markup.button.callback('❌ Batal', 'cancel')
      ])
    );
  }
  
  // Parse credentials
  const username = lines[0].split('Username:')[1]?.trim();
  const token = lines[1].split('Token:')[1]?.trim();
  const repo = lines[2].split('Repo:')[1]?.trim();
  
  if (!username || !token || !repo) {
    return ctx.reply(
      '❌ Format tidak valid. Pastikan semua informasi terisi.',
      Markup.inlineKeyboard([
        Markup.button.callback('❌ Batal', 'cancel')
      ])
    );
  }
  
  // Store credentials in context session
  ctx.session.github = { username, token, repo };
  
  // Reply with confirmation
  const statusMsg = await ctx.reply('🔄 Memverifikasi kredensial GitHub...');
  
  try {
    // Verify GitHub credentials
    const octokit = new Octokit({
      auth: token
    });
    
    const [owner, repo_name] = repo.split('/');
    
    await octokit.repos.get({
      owner,
      repo: repo_name
    });
    
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      '✅ Kredensial GitHub terverifikasi!',
      Markup.inlineKeyboard([
        Markup.button.callback('▶️ Lanjutkan', 'process_zip')
      ])
    );
    
    return ctx.scene.leave();
  } catch (error) {
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      `❌ Gagal memverifikasi kredensial: ${error.message}`,
      Markup.inlineKeyboard([
        Markup.button.callback('🔄 Coba Lagi', 'retry'),
        Markup.button.callback('❌ Batal', 'cancel')
      ])
    );
    return;
  }
});

githubCredentialsScene.action('retry', (ctx) => {
  ctx.deleteMessage();
  ctx.scene.reenter();
});

githubCredentialsScene.action('cancel', (ctx) => {
  ctx.deleteMessage();
  ctx.reply('❌ Operasi dibatalkan.');
  return ctx.scene.leave();
});

// Set up scene management
const stage = new Scenes.Stage([githubCredentialsScene]);
bot.use(session({ 
  defaultSession: () => ({}) // Tetapkan session default kosong
}));
bot.use(stage.middleware());

// Start command
bot.start((ctx) => {
  return ctx.reply(
    `👋 Halo ${ctx.from.first_name}!\n\n` +
    '🤖 Saya adalah bot yang dapat membantu Anda mengekstrak file ZIP dan mengunggahnya ke GitHub.\n\n' +
    '🔑 Untuk memulai, gunakan perintah /upload_zip',
    Markup.inlineKeyboard([
      Markup.button.callback('📚 Tutorial', 'tutorial'),
      Markup.button.callback('ℹ️ Tentang Bot', 'about')
    ])
  );
});

// Help command
bot.help((ctx) => {
  return ctx.reply(
    '🔍 Daftar Perintah:\n\n' +
    '/start - Mulai bot\n' +
    '/upload_zip - Unggah file ZIP untuk diproses\n' +
    '/help - Tampilkan bantuan\n\n' +
    '🔒 Catatan: Hanya admin yang dapat menggunakan bot ini.'
  );
});

// Tutorial action
bot.action('tutorial', (ctx) => {
  ctx.deleteMessage();
  return ctx.reply(
    '📚 Tutorial Penggunaan Bot:\n\n' +
    '1️⃣ Gunakan perintah /upload_zip\n' +
    '2️⃣ Unggah file ZIP yang ingin diproses\n' +
    '3️⃣ Masukkan kredensial GitHub Anda\n' +
    '4️⃣ Bot akan mengekstrak file ZIP dan mengunggahnya ke GitHub\n' +
    '5️⃣ Anda akan menerima notifikasi ketika proses selesai\n\n' +
    '🔑 Catatan:\n' +
    '- Anda memerlukan Personal Access Token GitHub dengan akses repo\n' +
    '- Format kredensial: Username, Token, dan Repository (owner/repo)',
    Markup.inlineKeyboard([
      Markup.button.callback('◀️ Kembali', 'back_to_main')
    ])
  );
});

// About action
bot.action('about', (ctx) => {
  ctx.deleteMessage();
  return ctx.reply(
    'ℹ️ Tentang Bot:\n\n' +
    '🤖 Bot Telegram untuk ekstrak ZIP dan push ke GitHub\n' +
    '🔒 Fitur admin untuk mengontrol akses\n' +
    '🔄 Dukungan file ZIP besar\n' +
    '📊 Pembaruan progres secara real-time\n' +
    '📁 Data pengguna tidak disimpan secara permanen\n\n' +
    '⚙️ Dibuat dengan Node.js, Telegraf, AdmZip, dan Octokit',
    Markup.inlineKeyboard([
      Markup.button.callback('◀️ Kembali', 'back_to_main')
    ])
  );
});

// Back to main action
bot.action('back_to_main', (ctx) => {
  ctx.deleteMessage();
  return ctx.reply(
    `👋 Halo ${ctx.from.first_name}!\n\n` +
    '🤖 Saya adalah bot yang dapat membantu Anda mengekstrak file ZIP dan mengunggahnya ke GitHub.\n\n' +
    '🔑 Untuk memulai, gunakan perintah /upload_zip',
    Markup.inlineKeyboard([
      Markup.button.callback('📚 Tutorial', 'tutorial'),
      Markup.button.callback('ℹ️ Tentang Bot', 'about')
    ])
  );
});

// Upload ZIP command
bot.command('upload_zip', isAdmin, (ctx) => {
  return ctx.reply(
    '📤 Silakan unggah file ZIP yang ingin diproses.',
    Markup.inlineKeyboard([
      Markup.button.callback('❌ Batal', 'cancel_upload')
    ])
  );
});

// Cancel upload action
bot.action('cancel_upload', (ctx) => {
  ctx.deleteMessage();
  return ctx.reply('❌ Unggahan dibatalkan.');
});

// Handle ZIP file upload
bot.on('document', isAdmin, async (ctx) => {
  const fileId = ctx.message.document.file_id;
  const fileName = ctx.message.document.file_name;
  
  // Check if file is a ZIP
  if (!fileName.endsWith('.zip')) {
    return ctx.reply('❌ Hanya file ZIP yang dapat diproses.');
  }
  
  const statusMsg = await ctx.reply('🔄 Mengunduh file ZIP...');
  
  try {
    // Download file
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const zipPath = path.join(tempDir, fileName);
    
    // Download file using axios
    const response = await axios({
      method: 'GET',
      url: fileLink.toString(),
      responseType: 'stream'
    });
    
    // Create a writable stream
    const fileStream = fs.createWriteStream(zipPath);
    
    // Pipe the response data to the file
    const downloadPromise = new Promise((resolve, reject) => {
      response.data.pipe(fileStream);
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });
    
    await downloadPromise;
    
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      '✅ File ZIP berhasil diunduh!',
      Markup.inlineKeyboard([
        Markup.button.callback('📂 Ekstrak ZIP', 'extract_zip')
      ])
    );
    
    // Store file path in session
    ctx.session = ctx.session || {};
    ctx.session.zipPath = zipPath;
    ctx.session.fileName = fileName;
    
  } catch (error) {
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      `❌ Gagal mengunduh file: ${error.message}`,
      Markup.inlineKeyboard([
        Markup.button.callback('🔄 Coba Lagi', 'retry_upload')
      ])
    );
  }
});

// Extract ZIP action
bot.action('extract_zip', async (ctx) => {
  if (!ctx.session || !ctx.session.zipPath) {
    return ctx.reply('❌ Tidak ada file ZIP untuk diekstrak. Silakan unggah file terlebih dahulu.');
  }
  
  const zipPath = ctx.session.zipPath;
  const extractDir = path.join(tempDir, 'extracted_' + Date.now());
  
  // Create extract directory
  if (!fs.existsSync(extractDir)) {
    fs.mkdirSync(extractDir, { recursive: true });
  }
  
  const statusMsg = await ctx.editMessageText(
    '🔄 Mengekstrak file ZIP...',
    Markup.inlineKeyboard([
      Markup.button.callback('❌ Batal', 'cancel_extract')
    ])
  );
  
  try {
    // Extract ZIP
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);
    
    // List extracted files
    const files = fs.readdirSync(extractDir);
    
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      `✅ File ZIP berhasil diekstrak!\n\n📂 Total file: ${files.length}`,
      Markup.inlineKeyboard([
        Markup.button.callback('🚀 Push ke GitHub', 'github_auth')
      ])
    );
    
    // Store extract directory in session
    ctx.session.extractDir = extractDir;
    
  } catch (error) {
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      `❌ Gagal mengekstrak file: ${error.message}`,
      Markup.inlineKeyboard([
        Markup.button.callback('🔄 Coba Lagi', 'retry_extract')
      ])
    );
  }
});

// Cancel extract action
bot.action('cancel_extract', (ctx) => {
  ctx.deleteMessage();
  return ctx.reply('❌ Ekstraksi dibatalkan.');
});

// Retry extract action
bot.action('retry_extract', (ctx) => {
  ctx.deleteMessage();
  return ctx.callbackQuery('extract_zip');
});

// GitHub authorization action
bot.action('github_auth', (ctx) => {
  return ctx.scene.enter('github_credentials');
});

// Process ZIP and push to GitHub action
bot.action('process_zip', async (ctx) => {
  if (!ctx.session || !ctx.session.extractDir || !ctx.session.github) {
    return ctx.reply('❌ Data tidak lengkap. Silakan mulai dari awal.');
  }
  
  const extractDir = ctx.session.extractDir;
  const { username, token, repo } = ctx.session.github;
  
  const statusMsg = await ctx.reply('🔄 Mempersiapkan unggahan ke GitHub...');
  
  try {
    // Create Octokit instance with credentials
    const octokit = new Octokit({
      auth: token
    });
    
    const [owner, repo_name] = repo.split('/');
    
    // Get current repo structure to handle updates
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      '🔄 Memeriksa struktur repositori...'
    );
    
    // Get default branch
    const repoInfo = await octokit.repos.get({
      owner,
      repo: repo_name
    });
    
    const defaultBranch = repoInfo.data.default_branch;
    
    // Get latest commit SHA
    const refData = await octokit.git.getRef({
      owner,
      repo: repo_name,
      ref: `heads/${defaultBranch}`
    });
    
    const latestCommitSha = refData.data.object.sha;
    
    // Create a new tree with extracted files
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      '🔄 Mempersiapkan file untuk diunggah...'
    );
    
    const files = [];
    const readDir = (dir, base = '') => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const relativePath = path.join(base, item);
        
        if (fs.statSync(itemPath).isDirectory()) {
          readDir(itemPath, relativePath);
        } else {
          const content = fs.readFileSync(itemPath);
          files.push({
            path: relativePath.replace(/\\/g, '/'),
            content: content.toString('base64'),
            encoding: 'base64'
          });
        }
      }
    };
    
    readDir(extractDir);
    
    // Show progress
    let uploadedFiles = 0;
    const totalFiles = files.length;
    
    // Create blobs for each file
    const createBlobs = async () => {
      const treeItems = [];
      
      for (const file of files) {
        // Update progress
        uploadedFiles++;
        if (uploadedFiles % 5 === 0 || uploadedFiles === totalFiles) {
          await ctx.telegram.editMessageText(
            statusMsg.chat.id,
            statusMsg.message_id,
            undefined,
            `🔄 Mengunggah file (${uploadedFiles}/${totalFiles})...`
          );
        }
        
        // Create blob
        const blob = await octokit.git.createBlob({
          owner,
          repo: repo_name,
          content: file.content,
          encoding: file.encoding
        });
        
        treeItems.push({
          path: file.path,
          mode: '100644', // regular file
          type: 'blob',
          sha: blob.data.sha
        });
      }
      
      return treeItems;
    };
    
    const treeItems = await createBlobs();
    
    // Create new tree
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      '🔄 Membuat tree baru...'
    );
    
    const tree = await octokit.git.createTree({
      owner,
      repo: repo_name,
      base_tree: latestCommitSha,
      tree: treeItems
    });
    
    // Create commit
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      '🔄 Membuat commit...'
    );
    
    const commit = await octokit.git.createCommit({
      owner,
      repo: repo_name,
      message: `Upload files from ZIP via Telegram Bot (${new Date().toISOString()})`,
      tree: tree.data.sha,
      parents: [latestCommitSha]
    });
    
    // Update reference
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      '🔄 Memperbarui referensi...'
    );
    
    await octokit.git.updateRef({
      owner,
      repo: repo_name,
      ref: `heads/${defaultBranch}`,
      sha: commit.data.sha
    });
    
    // Clean up temporary files
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.unlinkSync(ctx.session.zipPath);
    
    // Reset session data
    delete ctx.session.zipPath;
    delete ctx.session.extractDir;
    delete ctx.session.github;
    delete ctx.session.fileName;
    
    // Success message with repo link
    const repoUrl = `https://github.com/${repo}`;
    
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      `✅ Berhasil mengunggah file ke GitHub!\n\n` +
      `📂 Total file yang diunggah: ${totalFiles}\n` +
      `🔗 Repositori: [${repo}](${repoUrl})`,
      {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [Markup.button.url('🔗 Buka Repositori', repoUrl)],
            [Markup.button.callback('🏠 Kembali ke Menu Utama', 'back_to_main')]
          ]
        }
      }
    );
    
  } catch (error) {
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      `❌ Gagal mengunggah ke GitHub: ${error.message}`,
      Markup.inlineKeyboard([
        Markup.button.callback('🔄 Coba Lagi', 'process_zip'),
        Markup.button.callback('❌ Batal', 'cancel_github')
      ])
    );
  }
});

// Cancel GitHub upload action
bot.action('cancel_github', (ctx) => {
  ctx.deleteMessage();
  
  // Clean up temporary files if they exist
  if (ctx.session) {
    if (ctx.session.extractDir && fs.existsSync(ctx.session.extractDir)) {
      fs.rmSync(ctx.session.extractDir, { recursive: true, force: true });
    }
    
    if (ctx.session.zipPath && fs.existsSync(ctx.session.zipPath)) {
      fs.unlinkSync(ctx.session.zipPath);
    }
    
    // Reset session data
    delete ctx.session.zipPath;
    delete ctx.session.extractDir;
    delete ctx.session.github;
    delete ctx.session.fileName;
  }
  
  return ctx.reply('❌ Unggahan ke GitHub dibatalkan.');
});

// Handle errors
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  return ctx.reply(`❌ Terjadi kesalahan: ${err.message}`);
});

// Start the bot
bot.launch().then(() => {
  console.log('Bot telah dijalankan!');
}).catch(err => {
  console.error('Error starting bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
