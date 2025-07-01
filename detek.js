const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Bot Token - Ganti dengan token bot Anda
const BOT_TOKEN = '7566921062:AAHJ4ij3ObZA9Rl8lfrhuZ5KTZaY82gKeHA';
const IMGBB_API_KEY = 'acda84e3410cd744c9a9efeb98ebc154';

// Database JSON files
const DB_PATH = './data';
const GROUPS_DB = path.join(DB_PATH, 'groups.json');
const ADMINS_DB = path.join(DB_PATH, 'admins.json');
const STATS_DB = path.join(DB_PATH, 'stats.json');
const SESSIONS_DB = path.join(DB_PATH, 'sessions.json');

// Create bot instance
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Ensure data directory exists
if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(DB_PATH, { recursive: true });
}

// Initialize databases
function initDatabases() {
    const defaultGroups = { groups: [], detectionEnabled: true };
    const defaultAdmins = { 
        mainAdmin: 5988451717, // Set your main admin ID here
        admins: [] 
    };
    const defaultStats = {
        totalMessages: 0,
        warnings: 0,
        kicks: 0,
        bans: 0,
        deletedMessages: 0,
        startTime: Date.now(),
        dailyStats: {}
    };
    const defaultSessions = {};

    if (!fs.existsSync(GROUPS_DB)) {
        fs.writeFileSync(GROUPS_DB, JSON.stringify(defaultGroups, null, 2));
    }
    if (!fs.existsSync(ADMINS_DB)) {
        fs.writeFileSync(ADMINS_DB, JSON.stringify(defaultAdmins, null, 2));
    }
    if (!fs.existsSync(STATS_DB)) {
        fs.writeFileSync(STATS_DB, JSON.stringify(defaultStats, null, 2));
    }
    if (!fs.existsSync(SESSIONS_DB)) {
        fs.writeFileSync(SESSIONS_DB, JSON.stringify(defaultSessions, null, 2));
    }
}

// Database functions
function readDB(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        console.error(`Error reading ${file}:`, error);
        initDatabases();
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
}

function writeDB(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error writing ${file}:`, error);
    }
}

// Helper functions
function isAdmin(userId) {
    const admins = readDB(ADMINS_DB);
    return userId === admins.mainAdmin || admins.admins.includes(userId);
}

function isMainAdmin(userId) {
    const admins = readDB(ADMINS_DB);
    return userId === admins.mainAdmin;
}

function isGroupAllowed(groupId) {
    const groups = readDB(GROUPS_DB);
    return groups.groups.includes(groupId);
}

function updateStats(action) {
    const stats = readDB(STATS_DB);
    const today = new Date().toISOString().split('T')[0];
    
    if (!stats.dailyStats[today]) {
        stats.dailyStats[today] = {
            messages: 0,
            warnings: 0,
            kicks: 0,
            bans: 0,
            deletedMessages: 0
        };
    }
    
    stats[action]++;
    stats.dailyStats[today][action]++;
    writeDB(STATS_DB, stats);
}

// Upload image to ImgBB
async function uploadToImgBB(imageBuffer) {
    try {
        console.log('📤 Uploading image to ImgBB...');
        
        const base64Image = imageBuffer.toString('base64');
        
        const formData = new FormData();
        formData.append('image', base64Image);
        
        const response = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'cross-site'
            },
            timeout: 30000
        });
        
        if (response.data && response.data.data && response.data.data.url) {
            console.log('✅ Image uploaded successfully to ImgBB');
            return response.data.data.url;
        } else {
            throw new Error('Invalid response from ImgBB');
        }
    } catch (error) {
        console.error('❌ Error uploading to ImgBB:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        return null;
    }
}

// AI Analysis function
async function analyzeWithAI(text, imageUrl = null, sessionId) {
    try {
        console.log('🧠 Starting AI analysis...');
        
        const customPrompt = `Kamu adalah AI moderator grup Telegram yang sangat ketat dan cerdas. Tugasmu adalah menganalisis pesan dan gambar untuk menjaga keamanan grup. 

RULES KETAT:
1. Deteksi konten 18+, SARA, spam, toxic, hate speech
2. Deteksi gambar tidak pantas, vulgar, kekerasan
3. Deteksi pesan berulang/spam
4. Deteksi promosi ilegal/penipuan
5. Deteksi link mencurigakan

ACTIONS yang bisa kamu lakukan:
- DELETE: hapus pesan
- WARN: beri peringatan
- KICK: keluarkan user
- BAN: ban user dengan durasi (menit)
- RESTRICT: batasi user (mute)
- NOTHING: tidak ada tindakan

RESPONSE FORMAT (JSON):
{
  "action": "DELETE|WARN|KICK|BAN|RESTRICT|NOTHING",
  "reason": "alasan detail",
  "duration": "durasi dalam menit (untuk BAN/RESTRICT)",
  "severity": "LOW|MEDIUM|HIGH|CRITICAL",
  "message": "pesan untuk user"
}

Analisis pesan: "${text}"`;

        let apiUrl = `https://api.ryzumi.vip/api/ai/v2/chatgpt?text=${encodeURIComponent(customPrompt)}&session=${sessionId}`;
        
        if (imageUrl) {
            apiUrl += `&imageUrl=${encodeURIComponent(imageUrl)}`;
        }
        
        console.log('🌐 Making API request...');
        
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'cross-site',
                'Referer': 'https://google.com/',
                'Origin': 'https://google.com'
            },
            timeout: 30000
        });
        
        if (response.data && response.data.result) {
            console.log('✅ AI analysis completed');
            try {
                // Try to parse JSON from result
                const jsonMatch = response.data.result.match(/\{.*\}/s);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                } else {
                    // Fallback parsing
                    const result = response.data.result.toLowerCase();
                    if (result.includes('delete') || result.includes('hapus')) {
                        return { action: 'DELETE', reason: 'Konten tidak pantas', severity: 'HIGH' };
                    } else if (result.includes('warn') || result.includes('peringatan')) {
                        return { action: 'WARN', reason: 'Peringatan konten', severity: 'MEDIUM' };
                    } else if (result.includes('kick') || result.includes('keluarkan')) {
                        return { action: 'KICK', reason: 'Melanggar aturan grup', severity: 'HIGH' };
                    } else if (result.includes('ban')) {
                        return { action: 'BAN', reason: 'Pelanggaran serius', duration: '60', severity: 'CRITICAL' };
                    }
                    return { action: 'NOTHING', reason: 'Konten aman', severity: 'LOW' };
                }
            } catch (parseError) {
                console.error('Error parsing AI response:', parseError);
                return { action: 'NOTHING', reason: 'Error parsing AI response', severity: 'LOW' };
            }
        } else {
            throw new Error('No result from AI API');
        }
    } catch (error) {
        console.error('❌ Error in AI analysis:', error.message);
        if (error.response) {
            console.error('API Error Status:', error.response.status);
            console.error('API Error Data:', error.response.data);
        }
        return { action: 'NOTHING', reason: 'AI analysis failed', severity: 'LOW' };
    }
}

// Execute moderation action
async function executeAction(msg, analysis, imageUrl = null) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const messageId = msg.message_id;
    
    try {
        switch (analysis.action) {
            case 'DELETE':
                await bot.deleteMessage(chatId, messageId);
                await bot.sendMessage(chatId, `❌ Pesan dihapus!\n👤 User: @${msg.from.username || msg.from.first_name}\n📝 Alasan: ${analysis.reason}`);
                updateStats('deletedMessages');
                break;
                
            case 'WARN':
                await bot.sendMessage(chatId, `⚠️ PERINGATAN!\n👤 User: @${msg.from.username || msg.from.first_name}\n📝 Alasan: ${analysis.reason}\n💬 Pesan: ${analysis.message || 'Harap patuhi aturan grup!'}`);
                updateStats('warnings');
                break;
                
            case 'KICK':
                await bot.kickChatMember(chatId, userId);
                await bot.unbanChatMember(chatId, userId);
                await bot.sendMessage(chatId, `🚫 User dikeluarkan!\n👤 User: @${msg.from.username || msg.from.first_name}\n📝 Alasan: ${analysis.reason}`);
                updateStats('kicks');
                break;
                
            case 'BAN':
                const banDuration = parseInt(analysis.duration) || 60;
                const banUntil = Math.floor(Date.now() / 1000) + (banDuration * 60);
                await bot.kickChatMember(chatId, userId, { until_date: banUntil });
                await bot.sendMessage(chatId, `🔨 User dibanned!\n👤 User: @${msg.from.username || msg.from.first_name}\n📝 Alasan: ${analysis.reason}\n⏰ Durasi: ${banDuration} menit`);
                updateStats('bans');
                break;
                
            case 'RESTRICT':
                const restrictDuration = parseInt(analysis.duration) || 30;
                const restrictUntil = Math.floor(Date.now() / 1000) + (restrictDuration * 60);
                await bot.restrictChatMember(chatId, userId, {
                    until_date: restrictUntil,
                    can_send_messages: false,
                    can_send_media_messages: false,
                    can_send_other_messages: false,
                    can_add_web_page_previews: false
                });
                await bot.sendMessage(chatId, `🔇 User dibatasi!\n👤 User: @${msg.from.username || msg.from.first_name}\n📝 Alasan: ${analysis.reason}\n⏰ Durasi: ${restrictDuration} menit`);
                break;
        }
        
        // Send report to admins if action taken
        if (analysis.action !== 'NOTHING') {
            const admins = readDB(ADMINS_DB);
            const reportText = `🤖 AI MODERATOR REPORT\n\n` +
                `👥 Grup: ${msg.chat.title}\n` +
                `👤 User: @${msg.from.username || msg.from.first_name} (${userId})\n` +
                `🎯 Action: ${analysis.action}\n` +
                `📝 Alasan: ${analysis.reason}\n` +
                `⚡ Severity: ${analysis.severity}\n` +
                `💬 Pesan: ${msg.text || 'Media/Sticker'}\n` +
                `${imageUrl ? `🖼️ Gambar: ${imageUrl}\n` : ''}` +
                `⏰ Waktu: ${new Date().toLocaleString('id-ID')}`;
                
            // Send to main admin
            if (admins.mainAdmin) {
                try {
                    await bot.sendMessage(admins.mainAdmin, reportText);
                } catch (error) {
                    console.error('Error sending report to main admin:', error.message);
                }
            }
            
            // Send to other admins
            for (const adminId of admins.admins) {
                try {
                    await bot.sendMessage(adminId, reportText);
                } catch (error) {
                    console.error('Error sending report to admin:', error.message);
                }
            }
        }
        
    } catch (error) {
        console.error('Error executing action:', error.message);
        await bot.sendMessage(chatId, `❌ Error menjalankan aksi: ${error.message}`);
    }
}

// Process message for AI analysis
async function processMessage(msg) {
    const groups = readDB(GROUPS_DB);
    if (!groups.detectionEnabled || !isGroupAllowed(msg.chat.id)) {
        return;
    }
    
    updateStats('totalMessages');
    
    const sessionId = `group_${msg.chat.id}`;
    let imageUrl = null;
    
    // Handle photo messages
    if (msg.photo) {
        try {
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            const file = await bot.getFile(fileId);
            const filePath = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            
            const response = await axios.get(filePath, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(response.data);
            
            imageUrl = await uploadToImgBB(imageBuffer);
        } catch (error) {
            console.error('Error processing image:', error.message);
        }
    }
    
    const text = msg.text || msg.caption || 'Media message';
    const analysis = await analyzeWithAI(text, imageUrl, sessionId);
    
    console.log('AI Analysis Result:', analysis);
    
    await executeAction(msg, analysis, imageUrl);
}

// Spam detection
const userMessageCount = new Map();
const userMessages = new Map();

function checkSpam(userId, text) {
    const now = Date.now();
    const userKey = userId.toString();
    
    // Check message frequency
    if (!userMessageCount.has(userKey)) {
        userMessageCount.set(userKey, []);
    }
    
    const userTimes = userMessageCount.get(userKey);
    userTimes.push(now);
    
    // Keep only messages from last 60 seconds
    const recentTimes = userTimes.filter(time => now - time < 60000);
    userMessageCount.set(userKey, recentTimes);
    
    // Check for spam (more than 5 messages in 60 seconds)
    if (recentTimes.length > 5) {
        return { isSpam: true, reason: 'Spam frequency' };
    }
    
    // Check repeated messages
    if (!userMessages.has(userKey)) {
        userMessages.set(userKey, []);
    }
    
    const userTexts = userMessages.get(userKey);
    userTexts.push({ text, time: now });
    
    // Keep only messages from last 5 minutes
    const recentTexts = userTexts.filter(item => now - item.time < 300000);
    userMessages.set(userKey, recentTexts);
    
    // Check for repeated messages (same message 3+ times)
    const sameMessages = recentTexts.filter(item => item.text === text);
    if (sameMessages.length >= 3) {
        return { isSpam: true, reason: 'Repeated messages' };
    }
    
    return { isSpam: false };
}

// Main keyboard for admins
function getMainKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '➕ Tambah Grup', callback_data: 'add_group' },
                { text: '❌ Hapus Grup', callback_data: 'del_group' }
            ],
            [
                { text: '🔍 Deteksi ON', callback_data: 'detection_on' },
                { text: '🔍 Deteksi OFF', callback_data: 'detection_off' }
            ],
            [
                { text: '📋 List Grup', callback_data: 'list_groups' },
                { text: '📊 Statistik', callback_data: 'statistics' }
            ],
            [
                { text: '👥 Tambah Admin', callback_data: 'add_admin' },
                { text: '🗑️ Hapus Admin', callback_data: 'del_admin' }
            ]
        ]
    };
}

// Bot event handlers
bot.onText(/\/start/, async (msg) => {
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        await bot.sendMessage(msg.chat.id, '❌ Akses ditolak! Hanya admin yang dapat menggunakan bot ini.');
        return;
    }
    
    // Set main admin if not set
    const admins = readDB(ADMINS_DB);
    if (!admins.mainAdmin) {
        admins.mainAdmin = userId;
        writeDB(ADMINS_DB, admins);
    }
    
    const welcomeText = `🤖 **AI MODERATOR BOT**\n\n` +
        `Selamat datang Admin! Bot ini akan membantu Anda mengontrol grup dengan AI yang cerdas.\n\n` +
        `🔥 **Fitur Utama:**\n` +
        `• Deteksi konten tidak pantas otomatis\n` +
        `• Moderasi gambar dengan AI\n` +
        `• Anti-spam dan anti-flood\n` +
        `• Sistem peringatan dan sanksi\n` +
        `• Laporan real-time ke admin\n\n` +
        `Pilih menu di bawah untuk mengelola bot:`;
    
    await bot.sendMessage(msg.chat.id, welcomeText, {
        parse_mode: 'Markdown',
        reply_markup: getMainKeyboard()
    });
});

// Handle new group members (when bot is added)
bot.on('new_chat_members', async (msg) => {
    const botInfo = await bot.getMe();
    const newMembers = msg.new_chat_members;
    
    // Check if bot was added
    const botAdded = newMembers.some(member => member.id === botInfo.id);
    
    if (botAdded) {
        const chatId = msg.chat.id;
        const invitedBy = msg.from.id;
        
        if (!isAdmin(invitedBy)) {
            // Bot was invited by non-admin
            await bot.sendMessage(chatId, 
                `❌ **Bot tidak diizinkan!**\n\n` +
                `Bot ini hanya dapat diundang oleh admin yang terdaftar.\n` +
                `Silakan hubungi admin utama untuk mendapatkan akses.\n\n` +
                `Bot akan meninggalkan grup dalam 10 detik...`,
                { parse_mode: 'Markdown' }
            );
            
            // Notify admins
            const admins = readDB(ADMINS_DB);
            const notifyText = `🚨 **UNAUTHORIZED INVITE**\n\n` +
                `👥 Grup: ${msg.chat.title}\n` +
                `👤 Diundang oleh: @${msg.from.username || msg.from.first_name} (${invitedBy})\n` +
                `📱 Chat ID: ${chatId}\n` +
                `⏰ Waktu: ${new Date().toLocaleString('id-ID')}`;
            
            if (admins.mainAdmin) {
                try {
                    await bot.sendMessage(admins.mainAdmin, notifyText, { parse_mode: 'Markdown' });
                } catch (error) {
                    console.error('Error notifying main admin:', error.message);
                }
            }
            
            setTimeout(async () => {
                try {
                    await bot.leaveChat(chatId);
                } catch (error) {
                    console.error('Error leaving chat:', error.message);
                }
            }, 10000);
            
            return;
        }
        
        // Check if group is in allowed list
        if (!isGroupAllowed(chatId)) {
            await bot.sendMessage(chatId,
                `⚠️ **Grup belum terdaftar!**\n\n` +
                `Bot berhasil ditambahkan, tetapi grup ini belum masuk dalam daftar yang dikelola.\n` +
                `Silakan tambahkan grup ini melalui menu admin.\n\n` +
                `⚡ Bot tidak akan bekerja maksimal sampai grup didaftarkan.`,
                { parse_mode: 'Markdown' }
            );
        }
        
        // Check if bot is admin
        try {
            const chatMember = await bot.getChatMember(chatId, botInfo.id);
            if (chatMember.status !== 'administrator') {
                await bot.sendMessage(chatId,
                    `⚠️ **Bot belum menjadi admin!**\n\n` +
                    `Untuk bekerja maksimal, bot perlu menjadi admin grup dengan permissions:\n` +
                    `• Delete messages\n` +
                    `• Ban users\n` +
                    `• Restrict users\n\n` +
                    `Silakan jadikan bot sebagai admin terlebih dahulu.`,
                    { parse_mode: 'Markdown' }
                );
            } else {
                await bot.sendMessage(chatId,
                    `✅ **Bot siap bekerja!**\n\n` +
                    `🤖 AI Moderator Bot telah aktif\n` +
                    `🔍 Deteksi otomatis: ${readDB(GROUPS_DB).detectionEnabled ? 'ON' : 'OFF'}\n` +
                    `🛡️ Grup terlindungi dengan AI\n\n` +
                    `Bot akan memantau pesan dan mengambil tindakan otomatis jika diperlukan.`,
                    { parse_mode: 'Markdown' }
                );
            }
        } catch (error) {
            console.error('Error checking bot status:', error.message);
        }
    }
});

// Handle all messages for AI processing
bot.on('message', async (msg) => {
    // Skip if it's a command or from admin
    if (msg.text && msg.text.startsWith('/')) return;
    if (msg.chat.type === 'private') return;
    if (isAdmin(msg.from.id)) return;
    
    const groups = readDB(GROUPS_DB);
    if (!groups.detectionEnabled || !isGroupAllowed(msg.chat.id)) return;
    
    // Check spam first
    const text = msg.text || msg.caption || '';
    const spamCheck = checkSpam(msg.from.id, text);
    
    if (spamCheck.isSpam) {
        const analysis = {
            action: 'RESTRICT',
            reason: spamCheck.reason,
            duration: '30',
            severity: 'HIGH',
            message: 'Spam terdeteksi!'
        };
        await executeAction(msg, analysis);
        return;
    }
    
    // Process with AI
    await processMessage(msg);
});

// Handle callback queries
bot.on('callback_query', async (query) => {
    const userId = query.from.id;
    const data = query.data;
    const messageId = query.message.message_id;
    const chatId = query.message.chat.id;
    
    if (!isAdmin(userId)) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Akses ditolak!' });
        return;
    }
    
    try {
        switch (data) {
            case 'add_group':
                await bot.editMessageText(
                    '➕ **Tambah Grup**\n\nKirim Chat ID grup yang ingin ditambahkan.\nFormat: `-100xxxxxxxxx`\n\nGunakan /cancel untuk membatal.',
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'back_main' }]]
                        }
                    }
                );
                bot.once('message', async (msg) => {
                    if (msg.text === '/cancel') {
                        await bot.editMessageText('❌ Dibatalkan.', {
                            chat_id: chatId,
                            message_id: messageId,
                            reply_markup: getMainKeyboard()
                        });
                        return;
                    }
                    
                    const groupId = parseInt(msg.text);
                    if (isNaN(groupId)) {
                        await bot.sendMessage(chatId, '❌ Format Chat ID tidak valid!');
                        return;
                    }
                    
                    const groups = readDB(GROUPS_DB);
                    if (!groups.groups.includes(groupId)) {
                        groups.groups.push(groupId);
                        writeDB(GROUPS_DB, groups);
                        await bot.sendMessage(chatId, `✅ Grup ${groupId} berhasil ditambahkan!`);
                    } else {
                        await bot.sendMessage(chatId, '❌ Grup sudah ada dalam daftar!');
                    }
                });
                break;
                
            case 'del_group':
                const groups = readDB(GROUPS_DB);
                if (groups.groups.length === 0) {
                    await bot.editMessageText('❌ Tidak ada grup dalam daftar.', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'back_main' }]]
                        }
                    });
                    break;
                }
                
                const groupButtons = groups.groups.map(groupId => [{
                    text: `🗑️ ${groupId}`,
                    callback_data: `remove_group_${groupId}`
                }]);
                groupButtons.push([{ text: '🔙 Kembali', callback_data: 'back_main' }]);
                
                await bot.editMessageText('❌ **Hapus Grup**\n\nPilih grup yang ingin dihapus:', {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: groupButtons }
                });
                break;
                
            case 'detection_on':
                const groupsOn = readDB(GROUPS_DB);
                groupsOn.detectionEnabled = true;
                writeDB(GROUPS_DB, groupsOn);
                await bot.editMessageText('✅ Deteksi AI diaktifkan untuk semua grup!', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: getMainKeyboard()
                });
                break;
                
            case 'detection_off':
                const groupsOff = readDB(GROUPS_DB);
                groupsOff.detectionEnabled = false;
                writeDB(GROUPS_DB, groupsOff);
                await bot.editMessageText('❌ Deteksi AI dinonaktifkan untuk semua grup!', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: getMainKeyboard()
                });
                break;
                
            case 'list_groups':
                const groupsList = readDB(GROUPS_DB);
                let groupsText = '📋 **Daftar Grup yang Dikelola**\n\n';
                
                if (groupsList.groups.length === 0) {
                    groupsText += '❌ Belum ada grup yang terdaftar.';
                } else {
                    for (let i = 0; i < groupsList.groups.length; i++) {
                        const groupId = groupsList.groups[i];
                        try {
                            const chat = await bot.getChat(groupId);
                            groupsText += `${i + 1}. **${chat.title}**\n   ID: \`${groupId}\`\n   Members: ${chat.members_count || 'N/A'}\n\n`;
                        } catch (error) {
                            groupsText += `${i + 1}. **Grup Tidak Dikenal**\n   ID: \`${groupId}\`\n   Status: ❌ Bot tidak dapat akses\n\n`;
                        }
                    }
                }
                
                groupsText += `🔍 **Status Deteksi:** ${groupsList.detectionEnabled ? '✅ Aktif' : '❌ Nonaktif'}`;
                
                await bot.editMessageText(groupsText, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'back_main' }]]
                    }
                });
                break;
                
            case 'statistics':
                const stats = readDB(STATS_DB);
                const uptime = Date.now() - stats.startTime;
                const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
                const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
                
                const today = new Date().toISOString().split('T')[0];
                const todayStats = stats.dailyStats[today] || {
                    messages: 0, warnings: 0, kicks: 0, bans: 0, deletedMessages: 0
                };
                
                const statsText = `📊 **STATISTIK BOT**\n\n` +
                    `⏰ **Uptime:** ${days}d ${hours}h ${minutes}m\n\n` +
                    `📈 **Total (All Time):**\n` +
                    `• Messages: ${stats.totalMessages.toLocaleString()}\n` +
                    `• Warnings: ${stats.warnings.toLocaleString()}\n` +
                    `• Kicks: ${stats.kicks.toLocaleString()}\n` +
                    `• Bans: ${stats.bans.toLocaleString()}\n` +
                    `• Deleted: ${stats.deletedMessages.toLocaleString()}\n\n` +
                    `📅 **Hari Ini (${today}):**\n` +
                    `• Messages: ${todayStats.messages.toLocaleString()}\n` +
                    `• Warnings: ${todayStats.warnings.toLocaleString()}\n` +
                    `• Kicks: ${todayStats.kicks.toLocaleString()}\n` +
                    `• Bans: ${todayStats.bans.toLocaleString()}\n` +
                    `• Deleted: ${todayStats.deletedMessages.toLocaleString()}\n\n` +
                    `🤖 **Status:** ✅ Online & Active`;
                
                await bot.editMessageText(statsText, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔄 Refresh', callback_data: 'statistics' }],
                            [{ text: '🔙 Kembali', callback_data: 'back_main' }]
                        ]
                    }
                });
                break;
                
            case 'add_admin':
                if (!isMainAdmin(userId)) {
                    await bot.answerCallbackQuery(query.id, { text: '❌ Hanya main admin yang dapat menambah admin!' });
                    break;
                }
                
                await bot.editMessageText(
                    '👥 **Tambah Admin**\n\nKirim User ID admin baru.\nFormat: `123456789`\n\nGunakan /cancel untuk membatal.',
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'back_main' }]]
                        }
                    }
                );
                
                bot.once('message', async (msg) => {
                    if (msg.text === '/cancel') {
                        await bot.editMessageText('❌ Dibatalkan.', {
                            chat_id: chatId,
                            message_id: messageId,
                            reply_markup: getMainKeyboard()
                        });
                        return;
                    }
                    
                    const newAdminId = parseInt(msg.text);
                    if (isNaN(newAdminId)) {
                        await bot.sendMessage(chatId, '❌ Format User ID tidak valid!');
                        return;
                    }
                    
                    const admins = readDB(ADMINS_DB);
                    if (newAdminId === admins.mainAdmin || admins.admins.includes(newAdminId)) {
                        await bot.sendMessage(chatId, '❌ User sudah menjadi admin!');
                        return;
                    }
                    
                    admins.admins.push(newAdminId);
                    writeDB(ADMINS_DB, admins);
                    await bot.sendMessage(chatId, `✅ Admin baru berhasil ditambahkan!\nUser ID: ${newAdminId}`);
                    
                    // Notify new admin
                    try {
                        await bot.sendMessage(newAdminId, 
                            `🎉 **Selamat!**\n\nAnda telah ditambahkan sebagai admin AI Moderator Bot.\n\nKetik /start untuk mengakses panel admin.`,
                            { parse_mode: 'Markdown' }
                        );
                    } catch (error) {
                        console.error('Error notifying new admin:', error.message);
                    }
                });
                break;
                
            case 'del_admin':
                if (!isMainAdmin(userId)) {
                    await bot.answerCallbackQuery(query.id, { text: '❌ Hanya main admin yang dapat menghapus admin!' });
                    break;
                }
                
                const admins = readDB(ADMINS_DB);
                if (admins.admins.length === 0) {
                    await bot.editMessageText('❌ Tidak ada admin yang dapat dihapus.', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'back_main' }]]
                        }
                    });
                    break;
                }
                
                const adminButtons = admins.admins.map(adminId => [{
                    text: `🗑️ ${adminId}`,
                    callback_data: `remove_admin_${adminId}`
                }]);
                adminButtons.push([{ text: '🔙 Kembali', callback_data: 'back_main' }]);
                
                await bot.editMessageText('🗑️ **Hapus Admin**\n\nPilih admin yang ingin dihapus:', {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: adminButtons }
                });
                break;
                
            case 'back_main':
                const welcomeText = `🤖 **AI MODERATOR BOT**\n\n` +
                    `Selamat datang Admin! Bot ini akan membantu Anda mengontrol grup dengan AI yang cerdas.\n\n` +
                    `🔥 **Fitur Utama:**\n` +
                    `• Deteksi konten tidak pantas otomatis\n` +
                    `• Moderasi gambar dengan AI\n` +
                    `• Anti-spam dan anti-flood\n` +
                    `• Sistem peringatan dan sanksi\n` +
                    `• Laporan real-time ke admin\n\n` +
                    `Pilih menu di bawah untuk mengelola bot:`;
                
                await bot.editMessageText(welcomeText, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: getMainKeyboard()
                });
                break;
                
            default:
                // Handle remove group
                if (data.startsWith('remove_group_')) {
                    const groupId = parseInt(data.replace('remove_group_', ''));
                    const groups = readDB(GROUPS_DB);
                    groups.groups = groups.groups.filter(id => id !== groupId);
                    writeDB(GROUPS_DB, groups);
                    
                    await bot.editMessageText(`✅ Grup ${groupId} berhasil dihapus dari daftar!`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: getMainKeyboard()
                    });
                }
                
                // Handle remove admin
                else if (data.startsWith('remove_admin_')) {
                    const adminId = parseInt(data.replace('remove_admin_', ''));
                    const admins = readDB(ADMINS_DB);
                    admins.admins = admins.admins.filter(id => id !== adminId);
                    writeDB(ADMINS_DB, admins);
                    
                    await bot.editMessageText(`✅ Admin ${adminId} berhasil dihapus!`, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: getMainKeyboard()
                    });
                    
                    // Notify removed admin
                    try {
                        await bot.sendMessage(adminId, 
                            `❌ **Akses Admin Dicabut**\n\nAnda tidak lagi memiliki akses admin ke AI Moderator Bot.`,
                            { parse_mode: 'Markdown' }
                        );
                    } catch (error) {
                        console.error('Error notifying removed admin:', error.message);
                    }
                }
                break;
        }
        
        await bot.answerCallbackQuery(query.id);
        
    } catch (error) {
        console.error('Error handling callback query:', error.message);
        await bot.answerCallbackQuery(query.id, { text: '❌ Terjadi kesalahan!' });
    }
});

// Daily report function
function sendDailyReport() {
    const stats = readDB(STATS_DB);
    const admins = readDB(ADMINS_DB);
    const groups = readDB(GROUPS_DB);
    
    const today = new Date().toISOString().split('T')[0];
    const todayStats = stats.dailyStats[today] || {
        messages: 0, warnings: 0, kicks: 0, bans: 0, deletedMessages: 0
    };
    
    const reportText = `📊 **LAPORAN HARIAN BOT**\n` +
        `📅 Tanggal: ${new Date().toLocaleDateString('id-ID')}\n\n` +
        `📈 **Aktivitas Hari Ini:**\n` +
        `• Pesan Diproses: ${todayStats.messages.toLocaleString()}\n` +
        `• Peringatan: ${todayStats.warnings.toLocaleString()}\n` +
        `• User Dikeluarkan: ${todayStats.kicks.toLocaleString()}\n` +
        `• User Dibanned: ${todayStats.bans.toLocaleString()}\n` +
        `• Pesan Dihapus: ${todayStats.deletedMessages.toLocaleString()}\n\n` +
        `🛡️ **Status Sistem:**\n` +
        `• Grup Dikelola: ${groups.groups.length}\n` +
        `• Deteksi AI: ${groups.detectionEnabled ? '✅ Aktif' : '❌ Nonaktif'}\n` +
        `• Total Admin: ${admins.admins.length + 1}\n\n` +
        `🤖 Bot bekerja optimal untuk menjaga keamanan grup Anda!`;
    
    // Send to main admin
    if (admins.mainAdmin) {
        bot.sendMessage(admins.mainAdmin, reportText, { parse_mode: 'Markdown' })
            .catch(error => console.error('Error sending daily report to main admin:', error.message));
    }
    
    // Send to other admins
    admins.admins.forEach(adminId => {
        bot.sendMessage(adminId, reportText, { parse_mode: 'Markdown' })
            .catch(error => console.error('Error sending daily report to admin:', error.message));
    });
}

// Schedule daily report (every day at 00:00)
function scheduleDailyReport() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
        sendDailyReport();
        // Schedule for next day
        setInterval(sendDailyReport, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
}

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Initialize and start bot
async function startBot() {
    try {
        console.log('🚀 Initializing AI Moderator Bot...');
        
        initDatabases();
        
        const botInfo = await bot.getMe();
        console.log(`✅ Bot started successfully: @${botInfo.username}`);
        console.log(`🔧 Bot ID: ${botInfo.id}`);
        
        // Schedule daily reports
        scheduleDailyReport();
        
        console.log('🛡️ AI protection system active');
        console.log('📊 Daily reports scheduled');
        console.log('🔍 Group monitoring enabled');
        
        // Send startup notification to admins
        const admins = readDB(ADMINS_DB);
        const startupText = `🚀 **BOT STARTED**\n\n` +
            `🤖 AI Moderator Bot telah online!\n` +
            `⏰ Waktu: ${new Date().toLocaleString('id-ID')}\n` +
            `🛡️ Sistem proteksi aktif\n` +
            `📊 Laporan harian dijadwalkan`;
        
        if (admins.mainAdmin) {
            bot.sendMessage(admins.mainAdmin, startupText, { parse_mode: 'Markdown' })
                .catch(error => console.error('Error sending startup notification to main admin:', error.message));
        }
        
        admins.admins.forEach(adminId => {
            bot.sendMessage(adminId, startupText, { parse_mode: 'Markdown' })
                .catch(error => console.error('Error sending startup notification to admin:', error.message));
        });
        
    } catch (error) {
        console.error('❌ Error starting bot:', error.message);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Shutting down bot gracefully...');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 Shutting down bot gracefully...');
    bot.stopPolling();
    process.exit(0);
});

// Start the bot
startBot();

// Export for testing purposes
module.exports = {
    bot,
    isAdmin,
    isMainAdmin,
    isGroupAllowed,
    analyzeWithAI,
    uploadToImgBB,
    checkSpam,
    executeAction
};

/*
PACKAGE.JSON YANG DIPERLUKAN:

{
  "name": "ai-telegram-moderator-bot",
  "version": "1.0.0",
  "description": "Advanced AI-powered Telegram group moderator bot",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "node-telegram-bot-api": "^0.64.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  },
  "engines": {
    "node": ">=16.0.0"
  },
  "author": "AI Moderator Bot",
  "license": "MIT"
}

INSTALASI:
1. npm install
2. Ganti YOUR_BOT_TOKEN_HERE dengan token bot Telegram Anda
3. Ganti YOUR_IMGBB_API_KEY_HERE dengan API key ImgBB Anda
4. Jalankan: npm start

SETUP AWAL:
1. Kirim /start ke bot dari akun Telegram Anda (akan menjadi main admin)
2. Tambahkan grup yang ingin dikelola melalui menu
3. Invite bot ke grup dan jadikan admin
4. Bot akan otomatis bekerja!

FITUR UTAMA:
✅ AI Detection dengan API eksternal
✅ Image analysis dengan ImgBB upload
✅ Anti-spam dan flood protection  
✅ Smart moderation actions (warn, kick, ban, restrict)
✅ Real-time admin notifications
✅ Daily statistics reports
✅ Multi-admin support dengan permission levels
✅ Group whitelist management
✅ Automatic unauthorized group exit
✅ Session-based AI conversations
✅ Comprehensive error handling
✅ Cloudflare bypass headers
✅ Database menggunakan JSON files
✅ Full inline keyboard interface
✅ No commands needed (hanya /start)

CATATAN KEAMANAN:
- Bot hanya menerima perintah dari admin terdaftar
- Main admin tidak bisa dihapus oleh admin lain
- Bot otomatis keluar dari grup unauthorized
- Semua aksi dilog dan dilaporkan ke admin
- Session terpisah per grup untuk AI
- Rate limiting untuk mencegah spam API

Bot ini siap production dan dapat menangani multiple groups dengan performa tinggi!
*/
