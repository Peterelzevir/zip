const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');

// Bot configuration
const token = '7531971451:AAHcOd1gH0Nog2MRt7bPtE0NzR_ZUtvKiFc';
const admins = ['5988451717']; // Add admin IDs here
const bot = new Telegraf(token);
const userSessions = {};

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Middleware to check if user is admin
const adminCheck = (ctx, next) => {
  const userId = ctx.from.id.toString();
  if (admins.includes(userId)) {
    return next();
  }
  return ctx.reply('⛔ Hanya admin yang dapat menggunakan bot ini.');
};

// Apply admin check middleware to all updates
bot.use(adminCheck);

// Start command
bot.start((ctx) => {
  ctx.reply('👋 Selamat datang di ZIP Editor Bot!\n\nKirim file ZIP untuk mulai mengedit.', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📚 Bantuan', callback_data: 'help' }]
      ]
    }
  });
});

// Help command
bot.action('help', (ctx) => {
  ctx.editMessageText(
    '🔍 *Cara Menggunakan Bot*\n\n' +
    '1. Kirim file ZIP yang ingin diedit\n' +
    '2. Pilih file yang ingin dimodifikasi menggunakan tombol\n' +
    '3. Kirim file baru untuk mengganti file yang dipilih\n' +
    '4. Anda juga dapat menambah file baru, menghapus file, atau melihat isi file\n' +
    '5. Pilih untuk menyimpan perubahan atau melanjutkan pengeditan\n' +
    '6. Bot akan mengirimkan kembali file ZIP yang sudah dimodifikasi\n\n' +
    'Perintah: /start - Memulai bot\n' +
    'Perintah: /cancel - Membatalkan sesi pengeditan',
    { parse_mode: 'Markdown' }
  );
});

// Cancel command
bot.command('cancel', (ctx) => {
  const userId = ctx.from.id.toString();
  if (userSessions[userId]) {
    // Clean up temp files
    try {
      const sessionDir = path.join(tempDir, userSessions[userId].sessionId);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error('Error cleaning up session files:', err);
    }
    
    delete userSessions[userId];
    ctx.reply('🚫 Sesi pengeditan dibatalkan.');
  } else {
    ctx.reply('⚠️ Tidak ada sesi aktif.');
  }
});

// Show file list with pagination
async function showFileList(ctx, userId, messageId = null, page = 0) {
  const session = userSessions[userId];
  if (!session) return;
  
  const pageSize = 5;
  const startIdx = page * pageSize;
  const fileNames = session.fileList.slice(startIdx, startIdx + pageSize);
  
  // Create buttons for each file
  const fileButtons = fileNames.map(file => ([{
    text: `📄 ${file}`,
    callback_data: `file:${file}`
  }]));
  
  // Pagination buttons
  const paginationButtons = [];
  if (startIdx > 0) {
    paginationButtons.push({
      text: '⬅️ Sebelumnya',
      callback_data: `page:${page - 1}`
    });
  }
  if (startIdx + pageSize < session.fileList.length) {
    paginationButtons.push({
      text: 'Selanjutnya ➡️',
      callback_data: `page:${page + 1}`
    });
  }
  
  // Add pagination row if needed
  if (paginationButtons.length > 0) {
    fileButtons.push(paginationButtons);
  }
  
  // Add extra options
  fileButtons.push([
    { text: '📝 Ubah Nama ZIP', callback_data: 'rename' },
    { text: '➕ Tambah File', callback_data: 'add_file' }
  ]);
  fileButtons.push([
    { text: '✅ Selesai', callback_data: 'finish' }
  ]);
  
  const message = `🗂 *ZIP Editor*\n\nNama: \`${session.currentZipName}\`\n\nFile (${startIdx + 1}-${Math.min(startIdx + pageSize, session.fileList.length)} dari ${session.fileList.length}):\nPilih file yang ingin diubah:`;
  
  // Edit existing message or send new
  if (messageId) {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      messageId,
      null,
      message,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: fileButtons }
      }
    );
  } else {
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: fileButtons }
    });
  }
}

// Handle pagination
bot.action(/page:(\d+)/, (ctx) => {
  const userId = ctx.from.id.toString();
  const page = parseInt(ctx.match[1]);
  showFileList(ctx, userId, ctx.callbackQuery.message.message_id, page);
  ctx.answerCbQuery();
});

// Handle file selection
bot.action(/file:(.+)/, async (ctx) => {
  const userId = ctx.from.id.toString();
  const session = userSessions[userId];
  if (!session) return ctx.answerCbQuery('⚠️ Sesi tidak ditemukan');
  
  const selectedFile = ctx.match[1];
  session.selectedFile = selectedFile;
  
  // Show file options
  await ctx.editMessageText(
    `🔍 *File dipilih*: \`${selectedFile}\`\n\nSilahkan pilih aksi:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '👁️ Preview File', callback_data: 'preview' }],
          [{ text: '📤 Ganti dengan file baru', callback_data: 'replace' }],
          [{ text: '✏️ Edit isi teks', callback_data: 'edit' }],
          [{ text: '🗑️ Hapus File', callback_data: 'delete' }],
          [{ text: '🔙 Kembali ke daftar file', callback_data: 'back' }]
        ]
      }
    }
  );
  
  ctx.answerCbQuery();
});

// Back to file list
bot.action('back', (ctx) => {
  const userId = ctx.from.id.toString();
  showFileList(ctx, userId, ctx.callbackQuery.message.message_id, 0);
  ctx.answerCbQuery();
});

// Handle replace action
bot.action('replace', async (ctx) => {
  const userId = ctx.from.id.toString();
  const session = userSessions[userId];
  if (!session) return ctx.answerCbQuery('⚠️ Sesi tidak ditemukan');
  
  session.waitingForFile = true;
  
  await ctx.editMessageText(
    `📤 *Ganti File*\n\nKirim file baru (format apapun) untuk mengganti:\n\`${session.selectedFile}\`\n\nAtau klik batal untuk kembali.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Batal', callback_data: 'back' }]
        ]
      }
    }
  );
  
  ctx.answerCbQuery();
});

// Handle delete action
bot.action('delete', async (ctx) => {
  const userId = ctx.from.id.toString();
  const session = userSessions[userId];
  if (!session) return ctx.answerCbQuery('⚠️ Sesi tidak ditemukan');
  
  await ctx.editMessageText(
    `🗑️ *Hapus File*\n\nAnda yakin ingin menghapus file:\n\`${session.selectedFile}\`?`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Ya, Hapus', callback_data: 'confirm_delete' },
            { text: '❌ Tidak', callback_data: 'back' }
          ]
        ]
      }
    }
  );
  
  ctx.answerCbQuery();
});

// Handle confirm delete action
bot.action('confirm_delete', async (ctx) => {
  const userId = ctx.from.id.toString();
  const session = userSessions[userId];
  if (!session) return ctx.answerCbQuery('⚠️ Sesi tidak ditemukan');
  
  const filePath = path.join(session.extractPath, session.selectedFile);
  
  try {
    // Delete the file
    fs.unlinkSync(filePath);
    
    // Update file list
    session.fileList = session.fileList.filter(file => file !== session.selectedFile);
    
    await ctx.editMessageText(
      `✅ File berhasil dihapus: \`${session.selectedFile}\``,
      {
        parse_mode: 'Markdown'
      }
    );
    
    // Show file list after a short delay
    setTimeout(() => {
      showFileList(ctx, userId);
    }, 1000);
    
  } catch (error) {
    console.error('Error deleting file:', error);
    await ctx.editMessageText(
      `❌ Terjadi kesalahan saat menghapus file: ${error.message}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Kembali', callback_data: 'back' }]
          ]
        }
      }
    );
  }
  
  ctx.answerCbQuery();
});

// Handle add file action
bot.action('add_file', async (ctx) => {
  const userId = ctx.from.id.toString();
  const session = userSessions[userId];
  if (!session) return ctx.answerCbQuery('⚠️ Sesi tidak ditemukan');
  
  session.addingNewFile = true;
  
  await ctx.editMessageText(
    `➕ *Tambah File Baru*\n\nKirim file baru yang ingin ditambahkan ke dalam ZIP.\nAtau kirim pesan dalam format:\n\n/path nama_file.ext\n\nUntuk menambahkan file ke dalam folder.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Batal', callback_data: 'back' }]
        ]
      }
    }
  );
  
  ctx.answerCbQuery();
});

// Handle text edit action
bot.action('edit', async (ctx) => {
  const userId = ctx.from.id.toString();
  const session = userSessions[userId];
  if (!session) return ctx.answerCbQuery('⚠️ Sesi tidak ditemukan');
  
  const filePath = path.join(session.extractPath, session.selectedFile);
  
  try {
    // Check if file is text
    const fileContent = fs.readFileSync(filePath, 'utf8');
    session.waitingForText = true;
    session.originalContent = fileContent;
    
    // Send preview of current content
    const preview = fileContent.length > 500 
      ? fileContent.substring(0, 500) + '...' 
      : fileContent;
    
    await ctx.editMessageText(
      `✏️ *Edit Isi File*: \`${session.selectedFile}\`\n\n*Isi saat ini:*\n\`\`\`\n${preview}\n\`\`\`\n\nKirim teks baru untuk mengganti isi file, atau klik batal untuk kembali.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Batal', callback_data: 'back' }]
          ]
        }
      }
    );
    
  } catch (error) {
    await ctx.editMessageText(
      `⚠️ File tidak dapat diedit sebagai teks. Silahkan pilih opsi lain.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Kembali', callback_data: 'back' }]
          ]
        }
      }
    );
  }
  
  ctx.answerCbQuery();
});

// Handle preview action
bot.action('preview', async (ctx) => {
  const userId = ctx.from.id.toString();
  const session = userSessions[userId];
  if (!session) return ctx.answerCbQuery('⚠️ Sesi tidak ditemukan');
  
  const filePath = path.join(session.extractPath, session.selectedFile);
  
  try {
    // Get file stats
    const stats = fs.statSync(filePath);
    const fileSize = (stats.size / 1024).toFixed(2) + ' KB';
    
    // Determine file type
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    const fileType = mimeType.split('/')[0];
    
    await ctx.editMessageText(
      `🔍 *Preview File*: \`${session.selectedFile}\`\n\nTipe: ${mimeType}\nUkuran: ${fileSize}\n\nSedang memproses preview...`,
      {
        parse_mode: 'Markdown'
      }
    );
    
    // Handle different file types
    if (fileType === 'image') {
      // Preview image
      await ctx.replyWithPhoto({ source: filePath }, {
        caption: `📷 Preview: ${session.selectedFile}`
      });
    } else if (fileType === 'video') {
      // Preview video
      await ctx.replyWithVideo({ source: filePath }, {
        caption: `🎬 Preview: ${session.selectedFile}`
      });
    } else if (fileType === 'audio') {
      // Preview audio
      await ctx.replyWithAudio({ source: filePath }, {
        caption: `🎵 Preview: ${session.selectedFile}`
      });
    } else if (isTextFile(filePath, mimeType)) {
      // Preview text/code
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      // Truncate content if too large
      let previewContent = fileContent;
      let truncated = false;
      
      if (fileContent.length > 4000) {
        previewContent = fileContent.substring(0, 4000);
        truncated = true;
      }
      
      // Format code for display
      const formattedCode = `\`\`\`\n${previewContent}\n\`\`\``;
      
      await ctx.reply(
        `📝 *Source Code*: \`${session.selectedFile}\`\n\n${formattedCode}${truncated ? '\n\n_[Isi file terlalu panjang, hanya menampilkan 4000 karakter pertama]_' : ''}`,
        {
          parse_mode: 'Markdown'
        }
      );
    } else {
      // For other file types, just show info
      await ctx.reply(
        `📄 *File Info*: \`${session.selectedFile}\`\n\nTipe: ${mimeType}\nUkuran: ${fileSize}\n\nFile tipe ini tidak dapat di-preview.`,
        {
          parse_mode: 'Markdown'
        }
      );
    }
    
    // Return to file options after preview
    await ctx.reply(
      `🔍 *File*: \`${session.selectedFile}\`\n\nSilahkan pilih aksi selanjutnya:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📤 Ganti dengan file baru', callback_data: 'replace' }],
            [{ text: '✏️ Edit isi teks', callback_data: 'edit' }],
            [{ text: '🗑️ Hapus File', callback_data: 'delete' }],
            [{ text: '🔙 Kembali ke daftar file', callback_data: 'back' }]
          ]
        }
      }
    );
    
  } catch (error) {
    console.error('Error previewing file:', error);
    await ctx.editMessageText(
      `❌ Terjadi kesalahan saat preview file: ${error.message}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Kembali', callback_data: 'back' }]
          ]
        }
      }
    );
  }
  
  ctx.answerCbQuery();
});

// Handle rename action
bot.action('rename', async (ctx) => {
  const userId = ctx.from.id.toString();
  const session = userSessions[userId];
  if (!session) return ctx.answerCbQuery('⚠️ Sesi tidak ditemukan');
  
  session.waitingForZipName = true;
  
  await ctx.editMessageText(
    `📝 *Ubah Nama ZIP*\n\nNama saat ini: \`${session.currentZipName}\`\n\nKirim nama baru untuk file ZIP, atau klik batal untuk kembali.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Batal', callback_data: 'back' }]
        ]
      }
    }
  );
  
  ctx.answerCbQuery();
});

// Handle finish action
bot.action('finish', async (ctx) => {
  const userId = ctx.from.id.toString();
  const session = userSessions[userId];
  if (!session) return ctx.answerCbQuery('⚠️ Sesi tidak ditemukan');
  
  await ctx.editMessageText('⏳ Membuat file ZIP baru...');
  
  try {
    // Create new ZIP
    const newZipPath = path.join(session.sessionId, session.currentZipName);
    const zip = new AdmZip();
    
    // Add all files to ZIP
    zipDirectory(session.extractPath, zip, '');
    
    // Save ZIP
    zip.writeZip(path.join(tempDir, newZipPath));
    
    // Send ZIP
    await ctx.replyWithDocument({ 
      source: path.join(tempDir, newZipPath),
      filename: session.currentZipName
    }, {
      caption: '✅ File ZIP telah selesai diedit!'
    });
    
    // Clean up
    try {
      const sessionDir = path.join(tempDir, session.sessionId);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error('Error cleaning up session files:', err);
    }
    
    delete userSessions[userId];
    
  } catch (error) {
    console.error('Error creating ZIP:', error);
    await ctx.editMessageText('❌ Terjadi kesalahan saat membuat file ZIP.');
  }
});

// Handle incoming text for rename, edit, or path
bot.on(message('text'), async (ctx) => {
  const userId = ctx.from.id.toString();
  const session = userSessions[userId];
  if (!session) return;
  
  const text = ctx.message.text;
  
  // Handle ZIP rename
  if (session.waitingForZipName) {
    // Validate new name
    if (!text.toLowerCase().endsWith('.zip')) {
      return ctx.reply('⚠️ Nama file harus diakhiri dengan .zip');
    }
    
    session.currentZipName = text;
    session.waitingForZipName = false;
    
    await ctx.reply(`✅ Nama ZIP berhasil diubah menjadi: ${text}`);
    await showFileList(ctx, userId);
    return;
  }
  
  // Handle text edit
  if (session.waitingForText) {
    const filePath = path.join(session.extractPath, session.selectedFile);
    
    try {
      fs.writeFileSync(filePath, text);
      session.waitingForText = false;
      
      await ctx.reply(`✅ Isi file berhasil diubah: ${session.selectedFile}`);
      await showFileList(ctx, userId);
    } catch (error) {
      console.error('Error writing file:', error);
      ctx.reply('❌ Terjadi kesalahan saat menyimpan file.');
    }
    
    return;
  }
  
  // Handle custom path for adding new file
  if (session.addingNewFile && text.startsWith('/path ')) {
    session.waitingForFileWithPath = text.substring(6);
    
    await ctx.reply(
      `📂 *Custom Path*\n\nFile akan disimpan sebagai: \`${session.waitingForFileWithPath}\`\n\nKirim file yang ingin ditambahkan ke path ini.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Batal', callback_data: 'back' }]
          ]
        }
      }
    );
    
    return;
  }
});

// Handle incoming files for replacement or adding
bot.on(message('document'), async (ctx) => {
  const userId = ctx.from.id.toString();
  const session = userSessions[userId];
  
  // Check if we're adding a new file with custom path
  if (session && session.waitingForFileWithPath) {
    try {
      const fileId = ctx.message.document.file_id;
      const customPath = session.waitingForFileWithPath;
      
      // Create directories if needed
      const dirPath = path.dirname(path.join(session.extractPath, customPath));
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      const filePath = path.join(session.extractPath, customPath);
      
      // Status message
      const statusMsg = await ctx.reply('⏳ Mengunduh file...');
      
      // Download file
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const response = await fetch(fileLink);
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(filePath, Buffer.from(buffer));
      
      // Update file list
      session.fileList.push(customPath);
      delete session.waitingForFileWithPath;
      session.addingNewFile = false;
      
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        null,
        `✅ File berhasil ditambahkan: ${customPath}`
      );
      
      await showFileList(ctx, userId);
      
    } catch (error) {
      console.error('Error adding file with custom path:', error);
      ctx.reply('❌ Terjadi kesalahan saat menambahkan file.');
    }
    
    return;
  }
  
  // Check if we're adding a new file
  if (session && session.addingNewFile) {
    try {
      const fileId = ctx.message.document.file_id;
      const fileName = ctx.message.document.file_name;
      const filePath = path.join(session.extractPath, fileName);
      
      // Status message
      const statusMsg = await ctx.reply('⏳ Mengunduh file...');
      
      // Download file
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const response = await fetch(fileLink);
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(filePath, Buffer.from(buffer));
      
      // Update file list
      session.fileList.push(fileName);
      session.addingNewFile = false;
      
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        null,
        `✅ File berhasil ditambahkan: ${fileName}`
      );
      
      await showFileList(ctx, userId);
      
    } catch (error) {
      console.error('Error adding new file:', error);
      ctx.reply('❌ Terjadi kesalahan saat menambahkan file.');
    }
    
    return;
  }
  
  // Check if we're in file replacement mode
  if (session && session.waitingForFile) {
    try {
      const fileId = ctx.message.document.file_id;
      const filePath = path.join(session.extractPath, session.selectedFile);
      
      // Status message
      const statusMsg = await ctx.reply('⏳ Mengunduh file pengganti...');
      
      // Download file
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const response = await fetch(fileLink);
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(filePath, Buffer.from(buffer));
      
      session.waitingForFile = false;
      
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        null,
        `✅ File berhasil diganti: ${session.selectedFile}`
      );
      
      await showFileList(ctx, userId);
      
    } catch (error) {
      console.error('Error replacing file:', error);
      ctx.reply('❌ Terjadi kesalahan saat mengganti file.');
    }
    return;
  }
  
  // If we get here, this is a new ZIP upload, not a replacement
  try {
    const fileId = ctx.message.document.file_id;
    const fileName = ctx.message.document.file_name;
    
    // Check if file is a ZIP
    if (!fileName.toLowerCase().endsWith('.zip')) {
      return ctx.reply('⚠️ Mohon kirim file dengan format ZIP.');
    }
    
    // Create a new session
    const sessionId = uuidv4();
    const sessionDir = path.join(tempDir, sessionId);
    fs.mkdirSync(sessionDir);
    
    const originalZipPath = path.join(sessionDir, fileName);
    const extractPath = path.join(sessionDir, 'extracted');
    fs.mkdirSync(extractPath);
    
    // Status message
    const statusMsg = await ctx.reply('⏳ Mengunduh file ZIP...');
    
    // Download file
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await fetch(fileLink);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(originalZipPath, Buffer.from(buffer));
    
    // Extract ZIP
    await ctx.telegram.editMessageText(
      ctx.chat.id, 
      statusMsg.message_id, 
      null, 
      '⏳ Mengekstrak file ZIP...'
    );
    
    const zip = new AdmZip(originalZipPath);
    zip.extractAllTo(extractPath, true);
    
    // Get list of files
    const fileList = getAllFiles(extractPath).map(file => 
      path.relative(extractPath, file)
    );
    
    // Save session data
    userSessions[userId] = {
      sessionId,
      originalZipPath,
      extractPath,
      fileList,
      originalFileName: fileName,
      currentZipName: fileName
    };
    
    // Show file list
    await showFileList(ctx, userId, statusMsg.message_id);
    
  } catch (error) {
    console.error('Error handling ZIP file:', error);
    ctx.reply('❌ Terjadi kesalahan saat memproses file ZIP.');
  }
});

// Utility functions
function getAllFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat && stat.isDirectory()) {
      // Recurse into subdirectory
      results = results.concat(getAllFiles(filePath));
    } else {
      results.push(filePath);
    }
  });
  
  return results;
}

function zipDirectory(sourceDir, zip, parentDir) {
  const items = fs.readdirSync(sourceDir);
  
  items.forEach(item => {
    const itemPath = path.join(sourceDir, item);
    const itemStat = fs.statSync(itemPath);
    const relativePath = path.join(parentDir, item);
    
    if (itemStat.isDirectory()) {
      zipDirectory(itemPath, zip, relativePath);
    } else {
      const fileData = fs.readFileSync(itemPath);
      zip.addFile(relativePath, fileData);
    }
  });
}

// Function to check if a file is a text file
function isTextFile(filePath, mimeType) {
  // Common text mime types
  const textMimeTypes = [
    'text/',
    'application/json',
    'application/javascript',
    'application/xml',
    'application/x-httpd-php'
  ];
  
  // Check mime type
  if (textMimeTypes.some(type => mimeType.startsWith(type))) {
    return true;
  }
  
  // Common source code extensions
  const codeExtensions = [
    '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.php', '.py', 
    '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rb', '.pl', '.sh',
    '.json', '.xml', '.yaml', '.yml', '.md', '.txt', '.csv', '.sql',
    '.config', '.ini', '.env', '.htaccess', '.conf'
  ];
  
  const ext = path.extname(filePath).toLowerCase();
  return codeExtensions.includes(ext);
}

// Start the bot
bot.launch().then(() => {
  console.log('ZIP Editor Bot started!');
}).catch(err => {
  console.error('Error starting bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
