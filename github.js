const { Telegraf, Markup } = require('telegraf');
const { Scenes } = require('telegraf');
const AdmZip = require('adm-zip');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const LocalSession = require('telegraf-session-local');

// Bot configuration - Telegram bot token from BotFather
const BOT_TOKEN = '7332933814:AAGm2mbyQM6UyMQGggJyXbRsAgESv5c1uk8';
const bot = new Telegraf(BOT_TOKEN);

// List of Telegram user IDs that can use the bot (admins)
// Example: [123456789, 987654321]
const ADMIN_IDS = [5988451717]; // Replace with your admin Telegram ID
let AUTHORIZED_USERS = []; // Will be loaded from storage

const tempDir = path.join(os.tmpdir(), 'telegram-zip-github-bot');

// Set timeout for operations to 1 hour (3600000 ms)
const OPERATION_TIMEOUT = 3600000;

// Create temp directory if it doesn't exist
try {
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
} catch (error) {
  console.error('Error creating temp directory:', error);
}

// Setup persistent session storage with extended TTL
const localSession = new LocalSession({
  database: 'session_db.json',
  property: 'session',
  storage: LocalSession.storageMemory,
  format: {
    serialize: (obj) => JSON.stringify(obj),
    deserialize: (str) => JSON.parse(str),
  },
  state: { zipPath: null, extractDir: null, github: null, fileName: null },
  ttl: OPERATION_TIMEOUT // Set session TTL to 1 hour
});

// Storage for authorized users
const usersStorage = new LocalSession({
  database: 'users_db.json',
  property: 'users',
  storage: LocalSession.storageMemory,
  format: {
    serialize: (obj) => JSON.stringify(obj),
    deserialize: (str) => JSON.parse(str),
  },
  state: { authorizedUsers: [] }
});

// Load authorized users on startup
try {
  const data = fs.readFileSync('users_db.json', 'utf8');
  if (data) {
    const parsed = JSON.parse(data);
    if (parsed?.sessions?.__sessions?.authorizedUsers) {
      AUTHORIZED_USERS = parsed.sessions.__sessions.authorizedUsers || [];
    }
  }
} catch (error) {
  console.log('No users database found or error reading it, creating new one');
  // Initialize users DB
  usersStorage.middleware()({ session: {} }, () => {
    usersStorage.saveSession('__sessions', { authorizedUsers: [] });
  });
}

// Middleware to check if user is admin or authorized
const isAuthorized = (ctx, next) => {
  if (ADMIN_IDS.includes(ctx.from?.id) || AUTHORIZED_USERS.includes(ctx.from?.id)) {
    return next();
  }
  return ctx.reply('⛔ Maaf, Anda tidak memiliki akses untuk menggunakan bot ini.');
};

// Middleware to check if user is admin
const isAdmin = (ctx, next) => {
  if (ADMIN_IDS.includes(ctx.from?.id)) {
    return next();
  }
  return ctx.reply('⛔ Maaf, hanya admin yang dapat menggunakan fitur ini.');
};

// Apply authorization check to all messages
bot.use((ctx, next) => {
  // Skip middleware for callback queries - they'll be checked in their handlers
  if (ctx.callbackQuery) {
    return next();
  }
  
  if (ctx.message && !ADMIN_IDS.includes(ctx.from?.id) && !AUTHORIZED_USERS.includes(ctx.from?.id)) {
    return ctx.reply('⛔ Anda tidak memiliki akses untuk menggunakan bot ini.');
  }
  return next();
});

// Setup scenes for workflow
const { BaseScene } = Scenes;

// Scene for adding authorized users
const addUserScene = new BaseScene('add_user');
addUserScene.enter((ctx) => {
  return ctx.reply(
    '👤 Masukkan User ID Telegram pengguna yang ingin ditambahkan:',
    Markup.inlineKeyboard([
      Markup.button.callback('❌ Batal', 'cancel')
    ])
  );
});

addUserScene.on('text', async (ctx) => {
  const userId = ctx.message.text.trim();
  
  // Validate input is a number
  if (!/^\d+$/.test(userId)) {
    return ctx.reply(
      '❌ User ID tidak valid. Masukkan angka saja.',
      Markup.inlineKeyboard([
        Markup.button.callback('🔄 Coba Lagi', 'retry'),
        Markup.button.callback('❌ Batal', 'cancel')
      ])
    );
  }
  
  const numUserId = parseInt(userId);
  
  // Check if user is already authorized
  if (AUTHORIZED_USERS.includes(numUserId) || ADMIN_IDS.includes(numUserId)) {
    return ctx.reply(
      '⚠️ Pengguna ini sudah memiliki akses ke bot.',
      Markup.inlineKeyboard([
        Markup.button.callback('➕ Tambah Pengguna Lain', 'retry'),
        Markup.button.callback('❌ Selesai', 'cancel')
      ])
    );
  }
  
  // Add user to authorized list
  AUTHORIZED_USERS.push(numUserId);
  
  // Save to storage
  usersStorage.saveSession('__sessions', { authorizedUsers: AUTHORIZED_USERS });
  
  return ctx.reply(
    `✅ Pengguna dengan ID ${numUserId} berhasil ditambahkan ke daftar pengguna yang berwenang.`,
    Markup.inlineKeyboard([
      Markup.button.callback('➕ Tambah Pengguna Lain', 'retry'),
      Markup.button.callback('❌ Selesai', 'cancel')
    ])
  );
});

addUserScene.action('retry', (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  ctx.scene.reenter();
});

addUserScene.action('cancel', (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  ctx.reply('❌ Operasi dibatalkan.');
  return ctx.scene.leave();
});

// Scene for removing authorized users
const removeUserScene = new BaseScene('remove_user');
removeUserScene.enter((ctx) => {
  if (AUTHORIZED_USERS.length === 0) {
    ctx.reply('ℹ️ Tidak ada pengguna yang berwenang saat ini.');
    return ctx.scene.leave();
  }
  
  const keyboard = AUTHORIZED_USERS.map(id => [
    Markup.button.callback(`ID: ${id}`, `remove_user:${id}`)
  ]);
  
  keyboard.push([Markup.button.callback('❌ Batal', 'cancel')]);
  
  return ctx.reply(
    '👥 Pilih pengguna yang ingin dihapus:',
    Markup.inlineKeyboard(keyboard)
  );
});

removeUserScene.action(/remove_user:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  const userId = parseInt(ctx.match[1]);
  
  // Remove user from authorized list
  AUTHORIZED_USERS = AUTHORIZED_USERS.filter(id => id !== userId);
  
  // Save to storage
  usersStorage.saveSession('__sessions', { authorizedUsers: AUTHORIZED_USERS });
  
  ctx.deleteMessage();
  
  return ctx.reply(
    `✅ Pengguna dengan ID ${userId} berhasil dihapus dari daftar.`,
    Markup.inlineKeyboard([
      Markup.button.callback('🔄 Hapus Pengguna Lain', 'show_users'),
      Markup.button.callback('❌ Selesai', 'cancel')
    ])
  );
});

removeUserScene.action('show_users', (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  
  if (AUTHORIZED_USERS.length === 0) {
    ctx.reply('ℹ️ Tidak ada pengguna yang berwenang saat ini.');
    return ctx.scene.leave();
  }
  
  const keyboard = AUTHORIZED_USERS.map(id => [
    Markup.button.callback(`ID: ${id}`, `remove_user:${id}`)
  ]);
  
  keyboard.push([Markup.button.callback('❌ Batal', 'cancel')]);
  
  return ctx.reply(
    '👥 Pilih pengguna yang ingin dihapus:',
    Markup.inlineKeyboard(keyboard)
  );
});

removeUserScene.action('cancel', (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  ctx.reply('❌ Operasi dibatalkan.');
  return ctx.scene.leave();
});

// Scene for GitHub credentials
const githubCredentialsScene = new BaseScene('github_credentials');
githubCredentialsScene.enter((ctx) => {
  return ctx.reply(
    '🔐 Masukkan kredensial GitHub Anda dalam format berikut:\n\nUsername: your_username\nToken: your_personal_access_token',
    Markup.inlineKeyboard([
      Markup.button.callback('❌ Batal', 'cancel')
    ])
  );
});

githubCredentialsScene.on('text', async (ctx) => {
  const text = ctx.message.text;
  const lines = text.split('\n');
  
  // Check if format is correct
  if (lines.length < 2) {
    return ctx.reply(
      '❌ Format tidak valid. Gunakan format:\n\nUsername: your_username\nToken: your_personal_access_token',
      Markup.inlineKeyboard([
        Markup.button.callback('❌ Batal', 'cancel')
      ])
    );
  }
  
  // Parse credentials
  const username = lines[0].split('Username:')[1]?.trim();
  const token = lines[1].split('Token:')[1]?.trim();
  
  if (!username || !token) {
    return ctx.reply(
      '❌ Format tidak valid. Pastikan semua informasi terisi.',
      Markup.inlineKeyboard([
        Markup.button.callback('❌ Batal', 'cancel')
      ])
    );
  }
  
  // Store credentials in context session
  ctx.session.github = { username, token };
  
  // Reply with confirmation
  const statusMsg = await ctx.reply('🔄 Memverifikasi kredensial GitHub...');
  
  try {
    // Verify GitHub credentials
    const octokit = new Octokit({
      auth: token
    });
    
    // Verify by listing user's repositories
    await octokit.repos.listForAuthenticatedUser({
      per_page: 1
    });
    
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      '✅ Kredensial GitHub terverifikasi!',
      Markup.inlineKeyboard([
        Markup.button.callback('➕ Buat Repository Baru', 'create_new_repo'),
        Markup.button.callback('🔍 Gunakan Repository Yang Ada', 'use_existing_repo')
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
  ctx.answerCbQuery();
  ctx.deleteMessage();
  ctx.scene.reenter();
});

githubCredentialsScene.action('cancel', (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  ctx.reply('❌ Operasi dibatalkan.');
  return ctx.scene.leave();
});

// Scene for creating a new repository
const createRepoScene = new BaseScene('create_repo');
createRepoScene.enter((ctx) => {
  return ctx.reply(
    '➕ Masukkan detail repository baru yang ingin dibuat:\n\nNama: nama_repository\nVisibilitas: public/private',
    Markup.inlineKeyboard([
      Markup.button.callback('❌ Batal', 'cancel')
    ])
  );
});

createRepoScene.on('text', async (ctx) => {
  const text = ctx.message.text;
  const lines = text.split('\n');
  
  // Parse input
  let repoName, visibility;
  
  for (const line of lines) {
    if (line.toLowerCase().includes('nama:')) {
      repoName = line.split('Nama:')[1]?.trim() || line.split('nama:')[1]?.trim();
    } else if (line.toLowerCase().includes('visibilitas:')) {
      visibility = line.split('Visibilitas:')[1]?.trim().toLowerCase() || 
                   line.split('visibilitas:')[1]?.trim().toLowerCase();
    }
  }
  
  // Validate repository name
  if (!repoName || !/^[a-zA-Z0-9_.-]+$/.test(repoName)) {
    return ctx.reply(
      '❌ Nama repository tidak valid. Gunakan hanya huruf, angka, garis bawah, titik, dan tanda hubung.',
      Markup.inlineKeyboard([
        Markup.button.callback('🔄 Coba Lagi', 'retry_repo_name'),
        Markup.button.callback('❌ Batal', 'cancel')
      ])
    );
  }
  
  // Validate visibility
  if (!visibility || !['public', 'private'].includes(visibility)) {
    return ctx.reply(
      '❌ Visibilitas repository tidak valid. Pilih "public" atau "private".',
      Markup.inlineKeyboard([
        Markup.button.callback('🔄 Coba Lagi', 'retry_repo_name'),
        Markup.button.callback('❌ Batal', 'cancel')
      ])
    );
  }
  
  // Make sure ZIP data is still stored
  if (!ctx.session.zipPath || !ctx.session.extractDir) {
    return ctx.reply(
      '❌ Data ZIP hilang. Silakan mulai proses dari awal dengan mengunggah file ZIP.',
      Markup.inlineKeyboard([
        Markup.button.callback('📤 Upload ZIP Baru', 'upload_zip_action')
      ])
    );
  }
  
  const statusMsg = await ctx.reply('🔄 Membuat repository baru...');
  
  try {
    const { token } = ctx.session.github;
    
    const octokit = new Octokit({
      auth: token
    });
    
    // Create new repository
    const result = await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      private: visibility === 'private',
      auto_init: true
    });
    
    const repoFullName = result.data.full_name;
    
    ctx.session.github.repo = repoFullName;
    
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      `✅ Repository baru berhasil dibuat: ${repoFullName}\nVisibilitas: ${visibility}`,
      Markup.inlineKeyboard([
        Markup.button.callback('▶️ Lanjutkan Push Ke GitHub', 'process_zip')
      ])
    );
    
    return ctx.scene.leave();
  } catch (error) {
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      `❌ Gagal membuat repository: ${error.message}`,
      Markup.inlineKeyboard([
        Markup.button.callback('🔄 Coba Lagi', 'retry_repo_name'),
        Markup.button.callback('❌ Batal', 'cancel')
      ])
    );
  }
});

createRepoScene.action('retry_repo_name', (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  ctx.scene.reenter();
});

createRepoScene.action('cancel', (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  ctx.reply('❌ Pembuatan repository dibatalkan.');
  return ctx.scene.leave();
});

// Scene for selecting existing repository
const selectRepoScene = new BaseScene('select_repo');
selectRepoScene.enter(async (ctx) => {
  const statusMsg = await ctx.reply('🔄 Mengambil daftar repository...');
  
  try {
    const { token } = ctx.session.github;
    
    const octokit = new Octokit({
      auth: token
    });
    
    // Get the first 10 repositories
    const result = await octokit.repos.listForAuthenticatedUser({
      per_page: 10,
      sort: 'updated',
      direction: 'desc'
    });
    
    const repos = result.data;
    
    if (repos.length === 0) {
      await ctx.telegram.editMessageText(
        statusMsg.chat.id,
        statusMsg.message_id,
        undefined,
        '❌ Tidak ada repository yang ditemukan.',
        Markup.inlineKeyboard([
          Markup.button.callback('➕ Buat Repository Baru', 'create_new_repo'),
          Markup.button.callback('❌ Batal', 'cancel')
        ])
      );
      return;
    }
    
    // Create keyboard with repository buttons
    const keyboard = repos.map(repo => [
      Markup.button.callback(`${repo.full_name} (${repo.private ? 'private' : 'public'})`, `select_repo:${repo.full_name}`)
    ]);
    
    // Add navigation buttons
    keyboard.push([
      Markup.button.callback('➕ Buat Repository Baru', 'create_new_repo'),
      Markup.button.callback('❌ Batal', 'cancel')
    ]);
    
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      '🔍 Pilih repository yang ingin digunakan:',
      Markup.inlineKeyboard(keyboard)
    );
    
  } catch (error) {
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      `❌ Gagal mengambil daftar repository: ${error.message}`,
      Markup.inlineKeyboard([
        Markup.button.callback('🔄 Coba Lagi', 'use_existing_repo'),
        Markup.button.callback('❌ Batal', 'cancel')
      ])
    );
  }
});

selectRepoScene.action(/select_repo:(.+)/, (ctx) => {
  ctx.answerCbQuery();
  const repoFullName = ctx.match[1];
  
  // Make sure session remains intact
  if (!ctx.session.github) {
    ctx.session.github = {};
  }
  
  // Save repo name
  ctx.session.github.repo = repoFullName;
  
  // Make sure ZIP data is still stored
  if (!ctx.session.zipPath || !ctx.session.extractDir) {
    ctx.deleteMessage();
    return ctx.reply(
      '❌ Data ZIP hilang. Silakan mulai proses dari awal dengan mengunggah file ZIP.',
      Markup.inlineKeyboard([
        Markup.button.callback('📤 Upload ZIP Baru', 'upload_zip_action')
      ])
    );
  }
  
  ctx.deleteMessage();
  ctx.reply(
    `✅ Repository terpilih: ${repoFullName}`,
    Markup.inlineKeyboard([
      Markup.button.callback('▶️ Lanjutkan Push Ke GitHub', 'process_zip'),
      Markup.button.callback('🔄 Ubah Visibilitas Repository', 'change_visibility')
    ])
  );
  
  return ctx.scene.leave();
});

selectRepoScene.action('cancel', (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  ctx.reply('❌ Pemilihan repository dibatalkan.');
  return ctx.scene.leave();
});

// Scene for changing repository visibility
const changeVisibilityScene = new BaseScene('change_visibility');
changeVisibilityScene.enter((ctx) => {
  if (!ctx.session.github || !ctx.session.github.repo) {
    ctx.reply('❌ Tidak ada repository yang terpilih.');
    return ctx.scene.leave();
  }
  
  const repo = ctx.session.github.repo;
  
  return ctx.reply(
    `🔄 Ubah visibilitas untuk repository: ${repo}\n\nPilih visibilitas baru:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🔓 Public', 'visibility:public')],
      [Markup.button.callback('🔒 Private', 'visibility:private')],
      [Markup.button.callback('❌ Batal', 'cancel')]
    ])
  );
});

changeVisibilityScene.action(/visibility:(.+)/, async (ctx) => {
  ctx.answerCbQuery();
  
  const visibility = ctx.match[1];
  const isPrivate = visibility === 'private';
  
  if (!ctx.session.github || !ctx.session.github.repo || !ctx.session.github.token) {
    ctx.reply('❌ Data GitHub tidak lengkap.');
    return ctx.scene.leave();
  }
  
  const { repo, token } = ctx.session.github;
  const [owner, repo_name] = repo.split('/');
  
  const statusMsg = await ctx.reply(`🔄 Mengubah visibilitas repository menjadi ${visibility}...`);
  
  try {
    const octokit = new Octokit({
      auth: token
    });
    
    await octokit.repos.update({
      owner,
      repo: repo_name,
      private: isPrivate
    });
    
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      `✅ Visibilitas repository ${repo} berhasil diubah menjadi ${visibility}.`,
      Markup.inlineKeyboard([
        Markup.button.callback('◀️ Kembali', 'back_to_repo')
      ])
    );
    
  } catch (error) {
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      `❌ Gagal mengubah visibilitas repository: ${error.message}`,
      Markup.inlineKeyboard([
        Markup.button.callback('🔄 Coba Lagi', 'retry_visibility'),
        Markup.button.callback('❌ Batal', 'cancel')
      ])
    );
  }
  
  return ctx.scene.leave();
});

changeVisibilityScene.action('retry_visibility', (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  ctx.scene.reenter();
});

changeVisibilityScene.action('cancel', (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  ctx.reply('❌ Perubahan visibilitas dibatalkan.');
  return ctx.scene.leave();
});

// Scene for deleting a repository
const deleteRepoScene = new BaseScene('delete_repo');
deleteRepoScene.enter(async (ctx) => {
  const statusMsg = await ctx.reply('🔄 Mengambil daftar repository...');
  
  try {
    const { token } = ctx.session.github;
    
    const octokit = new Octokit({
      auth: token
    });
    
    // Get the first 10 repositories
    const result = await octokit.repos.listForAuthenticatedUser({
      per_page: 10,
      sort: 'updated',
      direction: 'desc'
    });
    
    const repos = result.data;
    
    if (repos.length === 0) {
      await ctx.telegram.editMessageText(
        statusMsg.chat.id,
        statusMsg.message_id,
        undefined,
        '❌ Tidak ada repository yang ditemukan.',
        Markup.inlineKeyboard([
          Markup.button.callback('❌ Batal', 'cancel')
        ])
      );
      return;
    }
    
    // Create keyboard with repository buttons
    const keyboard = repos.map(repo => [
      Markup.button.callback(repo.full_name, `delete_repo:${repo.full_name}`)
    ]);
    
    // Add cancel button
    keyboard.push([
      Markup.button.callback('❌ Batal', 'cancel')
    ]);
    
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      '⚠️ PERHATIAN: Pilih repository yang ingin DIHAPUS:\n\nTindakan ini tidak dapat dibatalkan!',
      Markup.inlineKeyboard(keyboard)
    );
    
  } catch (error) {
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      `❌ Gagal mengambil daftar repository: ${error.message}`,
      Markup.inlineKeyboard([
        Markup.button.callback('🔄 Coba Lagi', 'retry_delete_repo'),
        Markup.button.callback('❌ Batal', 'cancel')
      ])
    );
  }
});

deleteRepoScene.action(/delete_repo:(.+)/, async (ctx) => {
  ctx.answerCbQuery();
  
  const repoFullName = ctx.match[1];
  const [owner, repo] = repoFullName.split('/');
  
  // Confirm deletion
  await ctx.reply(
    `⚠️ KONFIRMASI PENGHAPUSAN\n\nAnda akan menghapus repository: ${repoFullName}\n\nTindakan ini TIDAK DAPAT DIBATALKAN!`,
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Ya, Hapus Repository', `confirm_delete:${repoFullName}`)],
      [Markup.button.callback('❌ Batal', 'cancel')]
    ])
  );
});

deleteRepoScene.action(/confirm_delete:(.+)/, async (ctx) => {
  ctx.answerCbQuery();
  
  const repoFullName = ctx.match[1];
  const [owner, repo_name] = repoFullName.split('/');
  
  if (!ctx.session.github || !ctx.session.github.token) {
    ctx.reply('❌ Data GitHub tidak lengkap.');
    return ctx.scene.leave();
  }
  
  const { token } = ctx.session.github;
  
  const statusMsg = await ctx.reply(`🔄 Menghapus repository ${repoFullName}...`);
  
  try {
    const octokit = new Octokit({
      auth: token
    });
    
    await octokit.repos.delete({
      owner,
      repo: repo_name
    });
    
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      `✅ Repository ${repoFullName} berhasil dihapus.`,
      Markup.inlineKeyboard([
        Markup.button.callback('🔄 Hapus Repository Lain', 'retry_delete_repo'),
        Markup.button.callback('🏠 Kembali ke Menu Utama', 'back_to_main')
      ])
    );
    
  } catch (error) {
    await ctx.telegram.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      undefined,
      `❌ Gagal menghapus repository: ${error.message}`,
      Markup.inlineKeyboard([
        Markup.button.callback('🔄 Coba Lagi', 'retry_delete_repo'),
        Markup.button.callback('❌ Batal', 'cancel')
      ])
    );
  }
  
  return ctx.scene.leave();
});

deleteRepoScene.action('retry_delete_repo', (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  ctx.scene.reenter();
});

deleteRepoScene.action('cancel', (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  ctx.reply('❌ Penghapusan repository dibatalkan.');
  return ctx.scene.leave();
});

// Set up scenes stage
const stage = new Scenes.Stage([
  githubCredentialsScene, 
  createRepoScene, 
  selectRepoScene,
  changeVisibilityScene,
  deleteRepoScene,
  addUserScene,
  removeUserScene
]);

// Use session and error handling middleware
bot.use(localSession.middleware());
bot.use(usersStorage.middleware());
bot.use(stage.middleware());

// Global error handler middleware
bot.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    console.error('Bot error caught in middleware:', error);
    // Try to notify user about error
    try {
      await ctx.reply('❌ Terjadi kesalahan pada bot. Silakan coba lagi dengan /start');
    } catch (replyError) {
      console.error('Failed to send error message to user:', replyError);
    }
  }
});

// Start command
bot.start((ctx) => {
  const isUserAdmin = ADMIN_IDS.includes(ctx.from.id);
  
  let keyboard = [
    [Markup.button.callback('📤 Upload ZIP', 'upload_zip_action')]
  ];
  
  // Add admin-only buttons
  if (isUserAdmin) {
    keyboard.push([
      Markup.button.callback('👥 Kelola Pengguna', 'manage_users'),
      Markup.button.callback('🗑️ Hapus Repository', 'delete_repository')
    ]);
  }
  
  keyboard.push([
    Markup.button.callback('📚 Tutorial', 'tutorial'),
    Markup.button.callback('ℹ️ Tentang Bot', 'about')
  ]);
  
  return ctx.reply(
    `👋 Halo ${ctx.from.first_name}!\n\n` +
    '🤖 Saya adalah bot yang dapat membantu Anda mengekstrak file ZIP dan mengunggahnya ke GitHub.\n\n' +
    '🔑 Untuk memulai, gunakan perintah /upload_zip atau klik tombol di bawah.',
    Markup.inlineKeyboard(keyboard)
  );
});

// Register callback handlers for all buttons explicitly
bot.action(/.*/, (ctx, next) => {
  // Log all callbacks for debugging
  console.log(`Received callback: ${ctx.callbackQuery.data}`);
  return next();
});

// Help command
bot.help((ctx) => {
  const isUserAdmin = ADMIN_IDS.includes(ctx.from.id);
  let helpText = '🔍 Daftar Perintah:\n\n' +
    '/start - Mulai bot\n' +
    '/upload_zip - Unggah file ZIP untuk diproses\n' +
    '/help - Tampilkan bantuan\n';
  
  if (isUserAdmin) {
    helpText += '/manage_users - Kelola pengguna yang berwenang\n' +
      '/manage_repos - Kelola repository GitHub\n';
  }
  
  helpText += '\n🔒 Catatan: Bot hanya dapat digunakan oleh admin dan pengguna yang diizinkan.';
  
  return ctx.reply(helpText);
});

// Manage users command - admin only
bot.command('manage_users', isAdmin, (ctx) => {
  return ctx.reply(
    '👥 Kelola Pengguna',
    Markup.inlineKeyboard([
      [Markup.button.callback('➕ Tambah Pengguna', 'add_user')],
      [Markup.button.callback('➖ Hapus Pengguna', 'remove_user')],
      [Markup.button.callback('📋 Daftar Pengguna', 'list_users')],
      [Markup.button.callback('🏠 Kembali ke Menu Utama', 'back_to_main')]
    ])
  );
});

// Manage repositories command
bot.command('manage_repos', isAuthorized, (ctx) => {
  return ctx.reply(
    '📂 Kelola Repository GitHub',
    Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Ubah Visibilitas Repository', 'change_repo_visibility')],
      [Markup.button.callback('🗑️ Hapus Repository', 'delete_repository')],
      [Markup.button.callback('🏠 Kembali ke Menu Utama', 'back_to_main')]
    ])
  );
});

// Manage users action
bot.action('manage_users', isAdmin, (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  return ctx.reply(
    '👥 Kelola Pengguna',
    Markup.inlineKeyboard([
      [Markup.button.callback('➕ Tambah Pengguna', 'add_user')],
      [Markup.button.callback('➖ Hapus Pengguna', 'remove_user')],
      [Markup.button.callback('📋 Daftar Pengguna', 'list_users')],
      [Markup.button.callback('🏠 Kembali ke Menu Utama', 'back_to_main')]
    ])
  );
});

// Add user action
bot.action('add_user', isAdmin, (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  return ctx.scene.enter('add_user');
});

// Remove user action
bot.action('remove_user', isAdmin, (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage();
  return ctx.scene.enter('remove_user');
});

// List users action
bot.action('list_users', isAdmin, (ctx) => {
  ctx.answerCbQuery();
  
  if (AUTHORIZED_USERS.length === 0) {
    return ctx.reply(
      '📋 Daftar Pengguna:\n\nTidak ada pengguna yang diizinkan saat ini.',
      Markup.inlineKeyboard([
        [Markup.button.callback('➕ Tambah Pengguna', 'add_user')],
        [Markup.button.callback('🏠 Kembali ke Menu Utama', 'back_to_main')]
      ])
    );
  }
  
  let userList = '📋 Daftar Pengguna yang Diizinkan:\n\n';
  
  AUTHORIZED_USERS.forEach((userId, index) => {
    userList += `${index + 1}. ID: ${userId}\n`;
  });
  
  ctx.deleteMessage();
  return ctx.reply(
    userList,
    Markup.inlineKeyboard([
      [Markup.button.callback('➕ Tambah Pengguna', 'add_user')],
      [Markup.button.callback('➖ Hapus Pengguna', 'remove_user')],
      [Markup.button.callback('🏠 Kembali ke Menu Utama', 'back_to_main')]
    ])
  );
});

// Change repository visibility action
bot.action('change_repo_visibility', isAuthorized, (ctx) => {
  ctx.answerCbQuery();
  
  // Check if GitHub credentials are available
  if (!ctx.session.github || !ctx.session.github.token) {
    ctx.deleteMessage();
    return ctx.reply(
      '❌ Kredensial GitHub tidak tersedia. Masukkan kredensial terlebih dahulu.',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔐 Masukkan Kredensial GitHub', 'github_auth')],
        [Markup.button.callback('🏠 Kembali ke Menu Utama', 'back_to_main')]
      ])
    );
  }
  
  ctx.deleteMessage();
  return ctx.scene.enter('change_visibility');
});

// Delete repository action
bot.action('delete_repository', isAuthorized, (ctx) => {
  ctx.answerCbQuery();
  
  // Check if GitHub credentials are available
  if (!ctx.session.github || !ctx.session.github.token) {
    ctx.deleteMessage();
    return ctx.reply(
      '❌ Kredensial GitHub tidak tersedia. Masukkan kredensial terlebih dahulu.',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔐 Masukkan Kredensial GitHub', 'github_auth')],
        [Markup.button.callback('🏠 Kembali ke Menu Utama', 'back_to_main')]
      ])
    );
  }
  
  ctx.deleteMessage();
  return ctx.scene.enter('delete_repo');
});

// Tutorial action
bot.action('tutorial', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(e => console.log('Error deleting message:', e));
    return ctx.reply(
      '📚 Tutorial Penggunaan Bot:\n\n' +
      '1️⃣ Gunakan perintah /upload_zip atau klik tombol "Upload ZIP"\n' +
      '2️⃣ Unggah file ZIP yang ingin diproses\n' +
      '3️⃣ Masukkan kredensial GitHub Anda\n' +
      '4️⃣ Pilih repository yang ada atau buat repository baru\n' +
      '5️⃣ Bot akan mengekstrak file ZIP dan mengunggahnya ke GitHub\n' +
      '6️⃣ Anda dapat mengelola repository seperti mengubah visibilitas atau menghapusnya\n\n' +
      '🔑 Catatan:\n' +
      '- Anda memerlukan Personal Access Token GitHub dengan akses repo\n' +
      '- Admin dapat mengelola pengguna yang diizinkan menggunakan bot',
      Markup.inlineKeyboard([
        Markup.button.callback('◀️ Kembali', 'back_to_main')
      ])
    );
  } catch (error) {
    console.error('Error in tutorial action:', error);
    return ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi dengan /start');
  }
});

// About action
bot.action('about', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(e => console.log('Error deleting message:', e));
    return ctx.reply(
      'ℹ️ Tentang Bot:\n\n' +
      '🤖 Bot Telegram untuk ekstrak ZIP dan push ke GitHub\n' +
      '🔒 Fitur admin untuk mengontrol akses pengguna\n' +
      '🔄 Dukungan file ZIP besar\n' +
      '📊 Pembaruan progres secara real-time\n' +
      '📁 Pengelolaan repository (publik/privat)\n' +
      '👥 Manajemen pengguna yang berwenang\n\n' +
      '⚙️ Dibuat dengan Node.js, Telegraf, AdmZip, dan Octokit',
      Markup.inlineKeyboard([
        Markup.button.callback('◀️ Kembali', 'back_to_main')
      ])
    );
  } catch (error) {
    console.error('Error in about action:', error);
    return ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi dengan /start');
  }
});

// Back to main action
bot.action('back_to_main', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(e => console.log('Error deleting message:', e));
    
    const isUserAdmin = ADMIN_IDS.includes(ctx.from.id);
    
    let keyboard = [
      [Markup.button.callback('📤 Upload ZIP', 'upload_zip_action')]
    ];
    
    // Add admin-only buttons
    if (isUserAdmin) {
      keyboard.push([
        Markup.button.callback('👥 Kelola Pengguna', 'manage_users'),
        Markup.button.callback('🗑️ Hapus Repository', 'delete_repository')
      ]);
    }
    
    keyboard.push([
      Markup.button.callback('📚 Tutorial', 'tutorial'),
      Markup.button.callback('ℹ️ Tentang Bot', 'about')
    ]);
    
    return ctx.reply(
      `👋 Halo ${ctx.from.first_name}!\n\n` +
      '🤖 Saya adalah bot yang dapat membantu Anda mengekstrak file ZIP dan mengunggahnya ke GitHub.\n\n' +
      '🔑 Untuk memulai, gunakan perintah /upload_zip atau klik tombol di bawah.',
      Markup.inlineKeyboard(keyboard)
    );
  } catch (error) {
    console.error('Error in back_to_main:', error);
    return ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi dengan /start');
  }
});
