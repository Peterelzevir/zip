// GitHub Upload Telegram Bot
const TelegramBot = require('node-telegram-bot-api');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const axios = require('axios');

// Token bot disimpan langsung dalam kode (tidak menggunakan .env)
const token = '7747122298:AAFG-dCt8FGJ3OrUMaxvNCXJdiOb6su8mFQ';

// Daftar ID Telegram admin yang diizinkan menggunakan bot
const ADMIN_IDS = [
  5988451717, // Ganti dengan ID Telegram Anda
  // Tambahkan ID admin lain jika diperlukan
];

// Inisialisasi bot
const bot = new TelegramBot(token, { polling: true });

// Store user sessions
const sessions = {};

// Initialize a new session or reset existing one
function initSession(userId) {
  sessions[userId] = {
    state: 'START',
    github: {
      token: null,
      username: null,
    },
    selectedRepo: null,
    selectedPath: '/',
    filesToUpload: [],
    confirmationMessage: null
  };
  return sessions[userId];
}

// Get or create user session
function getSession(userId) {
  if (!sessions[userId]) {
    return initSession(userId);
  }
  return sessions[userId];
}

// Check if user is admin
function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

// Admin verification middleware
function adminOnly(msg, callback) {
  const userId = msg.from.id;
  if (isAdmin(userId)) {
    callback();
  } else {
    bot.sendMessage(userId, '⛔ Akses ditolak. Bot ini hanya tersedia untuk admin.');
  }
}

// Command handlers
bot.onText(/\/start/, (msg) => {
  adminOnly(msg, () => {
    const userId = msg.from.id;
    initSession(userId);
    
    bot.sendMessage(userId, 
      'Selamat datang di GitHub Upload Bot! 🚀\n\n' +
      'Bot ini akan membantu Anda mengupload file ke repositori GitHub.\n\n' +
      'Silakan atur kredensial GitHub Anda terlebih dahulu dengan /setcredentials'
    );
  });
});

bot.onText(/\/setcredentials/, (msg) => {
  adminOnly(msg, () => {
    const userId = msg.from.id;
    const session = getSession(userId);
    
    session.state = 'AWAITING_GITHUB_USERNAME';
    bot.sendMessage(userId, 'Masukkan username GitHub Anda:');
  });
});

bot.onText(/\/listrepos/, async (msg) => {
  adminOnly(msg, async () => {
    const userId = msg.from.id;
    const session = getSession(userId);
    
    if (!session.github.token || !session.github.username) {
      return bot.sendMessage(userId, 'Silakan atur kredensial GitHub Anda terlebih dahulu dengan /setcredentials');
    }
    
    try {
      session.state = 'SELECTING_REPO';
      const repos = await listRepositories(session.github.token);
      
      if (repos.length === 0) {
        return bot.sendMessage(userId, 'Anda tidak memiliki repositori.');
      }
      
      const keyboard = repos.map(repo => [{
        text: repo.name,
        callback_data: `repo:${repo.name}`
      }]);
      
      bot.sendMessage(userId, 'Pilih repositori:', {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    } catch (error) {
      console.error('Error listing repositories:', error);
      bot.sendMessage(userId, `Error listing repositories: ${error.message}`);
    }
  });
});

bot.onText(/\/setpath/, (msg) => {
  adminOnly(msg, () => {
    const userId = msg.from.id;
    const session = getSession(userId);
    
    if (!session.selectedRepo) {
      return bot.sendMessage(userId, 'Silakan pilih repositori terlebih dahulu dengan /listrepos');
    }
    
    session.state = 'SETTING_PATH';
    bot.sendMessage(userId, 
      'Masukkan path di mana Anda ingin mengupload file.\n' +
      'Masukkan "/" untuk direktori root atau tentukan path seperti "folder/subfolder":'
    );
  });
});

bot.onText(/\/upload/, (msg) => {
  adminOnly(msg, () => {
    const userId = msg.from.id;
    const session = getSession(userId);
    
    if (!session.selectedRepo) {
      return bot.sendMessage(userId, 'Silakan pilih repositori terlebih dahulu dengan /listrepos');
    }
    
    session.state = 'UPLOADING';
    session.filesToUpload = [];
    
    bot.sendMessage(userId, 
      'Sekarang Anda dapat mengirimkan file untuk diupload.\n' +
      'Kirim /done ketika selesai atau /cancel untuk membatalkan.'
    );
  });
});

bot.onText(/\/done/, async (msg) => {
  adminOnly(msg, async () => {
    const userId = msg.from.id;
    const session = getSession(userId);
    
    if (session.state !== 'UPLOADING' || session.filesToUpload.length === 0) {
      return bot.sendMessage(userId, 'Tidak ada file untuk diupload. Gunakan /upload untuk mulai mengupload file.');
    }
    
    // Show confirmation message with file list
    const fileList = session.filesToUpload.map(file => `- ${file.name}`).join('\n');
    const confirmationMessage = `Anda akan mengupload file-file berikut ke ${session.selectedRepo}${session.selectedPath}:\n\n${fileList}`;
    
    session.state = 'CONFIRMING';
    session.confirmationMessage = await bot.sendMessage(userId, confirmationMessage, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Konfirmasi', callback_data: 'confirm_upload' },
            { text: '❌ Batal', callback_data: 'cancel_upload' }
          ]
        ]
      }
    });
  });
});

bot.onText(/\/cancel/, (msg) => {
  adminOnly(msg, () => {
    const userId = msg.from.id;
    const session = getSession(userId);
    
    if (session.state === 'UPLOADING') {
      session.filesToUpload = [];
      session.state = 'START';
      bot.sendMessage(userId, 'Upload dibatalkan. Tidak ada file yang akan diupload.');
    } else {
      bot.sendMessage(userId, 'Tidak ada yang perlu dibatalkan.');
    }
  });
});

bot.onText(/\/help/, (msg) => {
  adminOnly(msg, () => {
    const userId = msg.from.id;
    
    bot.sendMessage(userId, 
      'GitHub Upload Bot Help:\n\n' +
      '/start - Mulai bot\n' +
      '/setcredentials - Atur kredensial GitHub Anda\n' +
      '/listrepos - Daftar repositori GitHub Anda\n' +
      '/setpath - Atur path dalam repositori\n' +
      '/upload - Mulai mengupload file\n' +
      '/done - Selesai mengupload dan konfirmasi\n' +
      '/cancel - Batalkan upload saat ini\n' +
      '/status - Cek pengaturan saat ini\n' +
      '/help - Tampilkan pesan bantuan ini'
    );
  });
});

bot.onText(/\/status/, (msg) => {
  adminOnly(msg, () => {
    const userId = msg.from.id;
    const session = getSession(userId);
    
    const status = 
      `Status Saat Ini:\n\n` +
      `Pengguna GitHub: ${session.github.username || 'Belum diatur'}\n` +
      `Token GitHub: ${session.github.token ? '✅ Diatur' : '❌ Belum diatur'}\n` +
      `Repositori Terpilih: ${session.selectedRepo || 'Tidak ada'}\n` +
      `Path Upload: ${session.selectedPath}\n` +
      `File yang Akan Diupload: ${session.filesToUpload.length}`;
    
    bot.sendMessage(userId, status);
  });
});

// Message handler for text input
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const userId = msg.from.id;
  
  // Verify admin before processing any text
  if (!isAdmin(userId)) {
    return bot.sendMessage(userId, '⛔ Akses ditolak. Bot ini hanya tersedia untuk admin.');
  }
  
  const session = getSession(userId);
  
  switch (session.state) {
    case 'AWAITING_GITHUB_USERNAME':
      session.github.username = msg.text;
      session.state = 'AWAITING_GITHUB_TOKEN';
      bot.sendMessage(userId, 
        'Masukkan personal access token GitHub Anda.\n' +
        'Pastikan token memiliki scope "repo".\n\n' +
        'Token Anda akan disimpan hanya dalam sesi ini.'
      );
      break;
      
    case 'AWAITING_GITHUB_TOKEN':
      session.github.token = msg.text;
      session.state = 'START';
      
      // Delete the message containing the token for security
      bot.deleteMessage(msg.chat.id, msg.message_id)
        .catch(err => console.error('Could not delete token message:', err));
      
      // Validate credentials
      try {
        const octokit = new Octokit({ auth: session.github.token });
        const { data } = await octokit.users.getAuthenticated();
        
        if (data.login !== session.github.username) {
          bot.sendMessage(userId, 
            '⚠️ Peringatan: Username yang diberikan tidak cocok dengan akun yang terkait dengan token ini.\n' +
            `Token milik: ${data.login}`
          );
          session.github.username = data.login;
        }
        
        bot.sendMessage(userId, 
          '✅ Kredensial GitHub berhasil disimpan!\n\n' +
          'Sekarang gunakan /listrepos untuk memilih repositori.'
        );
      } catch (error) {
        console.error('Error validating GitHub token:', error);
        bot.sendMessage(userId, `❌ Token GitHub tidak valid: ${error.message}`);
        session.github.token = null;
        session.state = 'START';
      }
      break;
      
    case 'SETTING_PATH':
      // Normalize path format
      let inputPath = msg.text.trim();
      
      // Make sure path starts with a slash
      if (!inputPath.startsWith('/')) {
        inputPath = '/' + inputPath;
      }
      
      // Remove trailing slash if it's not just the root
      if (inputPath.length > 1 && inputPath.endsWith('/')) {
        inputPath = inputPath.slice(0, -1);
      }
      
      session.selectedPath = inputPath;
      session.state = 'START';
      bot.sendMessage(userId, `Path diatur ke: ${inputPath}\n\nSekarang gunakan /upload untuk mulai mengupload file.`);
      break;
  }
});

// Handle file uploads
bot.on('document', async (msg) => {
  const userId = msg.from.id;
  
  // Verify admin before processing file
  if (!isAdmin(userId)) {
    return bot.sendMessage(userId, '⛔ Akses ditolak. Bot ini hanya tersedia untuk admin.');
  }
  
  const session = getSession(userId);
  
  if (session.state !== 'UPLOADING') {
    return bot.sendMessage(userId, 'Silakan gunakan /upload untuk mulai mengupload file.');
  }
  
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;
  
  try {
    // Get file info
    const fileLink = await bot.getFileLink(fileId);
    
    // Download file
    const response = await axios({
      method: 'GET',
      url: fileLink,
      responseType: 'arraybuffer'
    });
    
    // Add to upload list
    session.filesToUpload.push({
      name: fileName,
      content: Buffer.from(response.data)
    });
    
    bot.sendMessage(userId, `Menambahkan ${fileName} ke antrian upload (total ${session.filesToUpload.length} file).`);
  } catch (error) {
    console.error('Error downloading file:', error);
    bot.sendMessage(userId, `Error menyiapkan file untuk upload: ${error.message}`);
  }
});

// Callback query handler
bot.on('callback_query', async (callbackQuery) => {
  const userId = callbackQuery.from.id;
  
  // Verify admin before processing callback
  if (!isAdmin(userId)) {
    return bot.answerCallbackQuery(callbackQuery.id, '⛔ Akses ditolak. Bot ini hanya tersedia untuk admin.');
  }
  
  const data = callbackQuery.data;
  const session = getSession(userId);
  
  // Handle repository selection
  if (data.startsWith('repo:')) {
    const repoName = data.replace('repo:', '');
    session.selectedRepo = repoName;
    session.state = 'START';
    
    await bot.answerCallbackQuery(callbackQuery.id);
    await bot.sendMessage(userId, 
      `Repositori terpilih: ${repoName}\n\n` +
      `Path saat ini: ${session.selectedPath}\n\n` +
      'Gunakan /setpath untuk mengubah path upload atau /upload untuk mulai mengupload file.'
    );
    
    // Edit message to show selection
    if (callbackQuery.message) {
      bot.editMessageText(`Repositori terpilih: ${repoName}`, {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        reply_markup: undefined
      }).catch(err => console.error('Could not edit message:', err));
    }
  }
  
  // Handle upload confirmation
  if (data === 'confirm_upload') {
    await bot.answerCallbackQuery(callbackQuery.id);
    
    // Edit confirmation message
    if (callbackQuery.message) {
      bot.editMessageText(`Mengupload file ke ${session.selectedRepo}${session.selectedPath}...`, {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        reply_markup: undefined
      }).catch(err => console.error('Could not edit message:', err));
    }
    
    // Perform the upload
    try {
      const results = await uploadFilesToGitHub(
        session.github.token,
        session.github.username,
        session.selectedRepo,
        session.selectedPath,
        session.filesToUpload
      );
      
      // Format and send results
      const resultMessages = results.map(r => 
        `${r.success ? '✅' : '❌'} ${r.fileName}: ${r.message}`
      ).join('\n');
      
      bot.sendMessage(userId, `Upload selesai!\n\n${resultMessages}`);
      
      // Reset files queue
      session.filesToUpload = [];
      session.state = 'START';
    } catch (error) {
      console.error('Error uploading to GitHub:', error);
      bot.sendMessage(userId, `Error mengupload ke GitHub: ${error.message}`);
    }
  }
  
  // Handle upload cancellation
  if (data === 'cancel_upload') {
    await bot.answerCallbackQuery(callbackQuery.id);
    
    session.filesToUpload = [];
    session.state = 'START';
    
    // Edit confirmation message
    if (callbackQuery.message) {
      bot.editMessageText('Upload dibatalkan. Tidak ada file yang diupload.', {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        reply_markup: undefined
      }).catch(err => console.error('Could not edit message:', err));
    }
  }
});

// GitHub API functions
async function listRepositories(token) {
  const octokit = new Octokit({ auth: token });
  
  try {
    const { data } = await octokit.repos.listForAuthenticatedUser({
      visibility: 'all',
      sort: 'updated',
      per_page: 100
    });
    
    return data.map(repo => ({
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private
    }));
  } catch (error) {
    console.error('Error listing repositories:', error);
    throw error;
  }
}

async function uploadFilesToGitHub(token, username, repo, targetPath, files) {
  const octokit = new Octokit({ auth: token });
  const results = [];
  
  // Normalize target path (remove leading slash for GitHub API)
  const normalizedPath = targetPath === '/' ? '' : targetPath.slice(1);
  
  for (const file of files) {
    try {
      // Get the current file if it exists to get the SHA
      let fileSha = null;
      try {
        const { data } = await octokit.repos.getContent({
          owner: username,
          repo: repo,
          path: normalizedPath ? `${normalizedPath}/${file.name}` : file.name
        });
        fileSha = data.sha;
      } catch (error) {
        // File doesn't exist yet, which is fine
        if (error.status !== 404) {
          throw error;
        }
      }
      
      // Prepare file content
      const content = file.content.toString('base64');
      
      // Create or update file
      const { data } = await octokit.repos.createOrUpdateFileContents({
        owner: username,
        repo: repo,
        path: normalizedPath ? `${normalizedPath}/${file.name}` : file.name,
        message: `Upload ${file.name} via Telegram Bot`,
        content: content,
        sha: fileSha
      });
      
      results.push({
        fileName: file.name,
        success: true,
        message: fileSha ? 'Berhasil diperbarui' : 'Berhasil dibuat',
        url: data.content.html_url
      });
    } catch (error) {
      console.error(`Error uploading ${file.name}:`, error);
      results.push({
        fileName: file.name,
        success: false,
        message: error.message || 'Unknown error'
      });
    }
  }
  
  return results;
}

// Start the bot
console.log('GitHub Upload Bot is running (Admin Only)...');
