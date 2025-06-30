//
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// Bot Token - Ganti dengan token bot Anda
const BOT_TOKEN = '7566921062:AAHJ4ij3ObZA9Rl8lfrhuZ5KTZaY82gKeHA';
const IMGBB_API_KEY = 'acda84e3410cd744c9a9efeb98ebc154'; // Daftar di imgbb.com untuk API key

// Inisialisasi bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// File untuk menyimpan data
const DATA_FILE = './bot_data.json';

// Default data structure
const defaultData = {
    admins: [5988451717], // ID admin utama (ganti dengan ID Telegram Anda)
    mainAdmin: 5988451717, // ID admin utama yang tidak bisa dihapus
    groups: [], // List grup yang dikelola
    detectionEnabled: true,
    sessions: {}, // Session untuk setiap grup
    statistics: {
        totalWarnings: 0,
        totalBans: 0,
        totalRestrictions: 0,
        totalDeletedMessages: 0,
        suspiciousUsers: [],
        dailyReports: []
    },
    userWarnings: {}, // Track peringatan per user per grup
    spamDetection: {} // Track spam per user
};

// Load atau create data
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            return { ...defaultData, ...data };
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
    return defaultData;
}

// Save data
function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// Global data
let botData = loadData();

// FIXED: Upload image to ImgBB with better error handling
async function uploadToImgBB(photoBuffer) {
    try {
        console.log('📤 Uploading image to ImgBB...');
        
        // Convert buffer to base64
        const base64Image = photoBuffer.toString('base64');
        
        // Create form data
        const formData = new FormData();
        formData.append('image', base64Image);
        
        // Upload to ImgBB
        const response = await axios.post(
            `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Content-Type': 'multipart/form-data'
                },
                timeout: 30000, // 30 seconds timeout
                maxContentLength: 50 * 1024 * 1024, // 50MB max
                maxBodyLength: 50 * 1024 * 1024
            }
        );
        
        if (response.data && response.data.success && response.data.data) {
            console.log('✅ Image uploaded successfully:', response.data.data.url);
            return response.data.data.url;
        } else {
            console.error('❌ ImgBB upload failed:', response.data);
            return null;
        }
        
    } catch (error) {
        console.error('❌ Error uploading to ImgBB:', error.message);
        
        // Log specific error details
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        
        return null;
    }
}

// FIXED: Better image processing with multiple attempts and proper error handling
async function processImage(photoArray) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            console.log(`🔄 Processing image attempt ${attempt + 1}/3...`);
            
            // Get the highest quality photo
            const photo = photoArray[photoArray.length - 1];
            const fileId = photo.file_id;
            
            console.log('📥 Getting file info from Telegram...');
            const file = await bot.getFile(fileId);
            
            console.log('⬇️ Downloading image from Telegram...');
            // Download file from Telegram
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            const response = await axios.get(fileUrl, {
                responseType: 'arraybuffer',
                timeout: 30000,
                maxContentLength: 20 * 1024 * 1024 // 20MB max
            });
            
            const buffer = Buffer.from(response.data);
            console.log(`📊 Image size: ${buffer.length} bytes`);
            
            // Check if image is too large (ImgBB has 32MB limit)
            if (buffer.length > 32 * 1024 * 1024) {
                console.error('❌ Image too large for ImgBB (>32MB)');
                return null;
            }
            
            // Upload to ImgBB
            const imageUrl = await uploadToImgBB(buffer);
            
            if (imageUrl) {
                console.log('✅ Image processing successful!');
                return imageUrl;
            }
            
        } catch (error) {
            console.error(`❌ Image processing attempt ${attempt + 1} failed:`, error.message);
            
            if (attempt === 2) {
                console.error('❌ All image processing attempts failed');
                return null;
            }
            
            // Wait before retry (exponential backoff)
            const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
    return null;
}

// FIXED: AI Analysis dengan error handling yang lebih baik
async function analyzeWithAI(text, imageUrl = null, groupId) {
    try {
        console.log('🧠 Starting AI analysis...');
        
        // Ensure session exists for group
        if (!botData.sessions[groupId]) {
            botData.sessions[groupId] = `group_${groupId}_${Date.now()}`;
            saveData(botData);
        }

        const customPrompt = `Kamu adalah AI bot administrator grup Telegram yang bertugas melindungi grup dari konten berbahaya. Analisis pesan/gambar ini dan berikan keputusan yang tepat.

TUGAS KAMU:
- Deteksi konten 18+, SARA, spam, hate speech, scam, phishing
- Deteksi gambar tidak pantas, vulgar, kekerasan
- Deteksi perilaku mencurigakan user
- Berikan keputusan: DELETE_MESSAGE, WARN_USER, RESTRICT_USER, BAN_USER, atau SAFE

FORMAT RESPONS (WAJIB JSON):
{
  "decision": "DELETE_MESSAGE/WARN_USER/RESTRICT_USER/BAN_USER/SAFE",
  "reason": "alasan singkat",
  "severity": 1-10,
  "restriction_duration": "1h/1d/7d/30d" (jika restrict),
  "message_to_user": "pesan untuk user"
}

Pesan user: ${text}`;

        // Build API URL
        const baseUrl = 'https://api.ryzumi.vip/api/ai/v2/chatgpt';
        const params = new URLSearchParams({
            text: customPrompt,
            session: botData.sessions[groupId]
        });
        
        if (imageUrl) {
            params.append('imageUrl', imageUrl);
            console.log('🖼️ Analyzing with image:', imageUrl);
        }
        
        const apiUrl = `${baseUrl}?${params.toString()}`;
        console.log('🌐 Making API request...');

        const response = await axios.get(apiUrl, {
            timeout: 30000, // 30 seconds
            headers: {
                'User-Agent': 'Telegram-Bot/1.0'
            }
        });
        
        console.log('📡 API response received');
        
        if (response.data && response.data.result) {
            try {
                // Try to parse JSON from AI response
                const jsonMatch = response.data.result.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const decision = JSON.parse(jsonMatch[0]);
                    console.log('✅ AI analysis completed:', decision.decision);
                    return decision;
                }
                
                // If no JSON found, create default safe response
                console.log('⚠️ No JSON found in AI response, defaulting to SAFE');
                return {
                    decision: 'SAFE',
                    reason: 'Tidak dapat menganalisis format respons',
                    severity: 1,
                    message_to_user: 'Pesan aman'
                };
                
            } catch (parseError) {
                console.error('❌ JSON parsing failed:', parseError);
                return {
                    decision: 'SAFE',
                    reason: 'Error parsing AI response',
                    severity: 1,
                    message_to_user: 'Pesan aman'
                };
            }
        } else {
            console.error('❌ Invalid API response:', response.data);
            return null;
        }
        
    } catch (error) {
        console.error('❌ Error in AI analysis:', error.message);
        
        if (error.response) {
            console.error('API Error Status:', error.response.status);
            console.error('API Error Data:', error.response.data);
        }
        
        return null;
    }
}

// Spam detection
function detectSpam(userId, groupId) {
    const key = `${userId}_${groupId}`;
    const now = Date.now();
    
    if (!botData.spamDetection[key]) {
        botData.spamDetection[key] = [];
    }
    
    // Remove old entries (older than 1 minute)
    botData.spamDetection[key] = botData.spamDetection[key].filter(time => now - time < 60000);
    
    // Add current time
    botData.spamDetection[key].push(now);
    
    // If more than 10 messages in 1 minute, it's spam
    return botData.spamDetection[key].length > 10;
}

// Execute AI decision
async function executeDecision(decision, msg, reason) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const messageId = msg.message_id;
    
    try {
        switch (decision.decision) {
            case 'DELETE_MESSAGE':
                await bot.deleteMessage(chatId, messageId);
                await bot.sendMessage(chatId, `⚠️ Pesan dihapus: ${decision.reason}`, {
                    reply_to_message_id: messageId
                }).catch(() => {});
                botData.statistics.totalDeletedMessages++;
                break;
                
            case 'WARN_USER':
                if (!botData.userWarnings[`${userId}_${chatId}`]) {
                    botData.userWarnings[`${userId}_${chatId}`] = 0;
                }
                botData.userWarnings[`${userId}_${chatId}`]++;
                
                const warningCount = botData.userWarnings[`${userId}_${chatId}`];
                await bot.sendMessage(chatId, 
                    `⚠️ Peringatan untuk @${msg.from.username || msg.from.first_name}\n` +
                    `Alasan: ${decision.reason}\n` +
                    `Peringatan: ${warningCount}/3\n` +
                    `${decision.message_to_user || ''}`
                );
                
                botData.statistics.totalWarnings++;
                
                // Auto ban after 3 warnings
                if (warningCount >= 3) {
                    await bot.banChatMember(chatId, userId);
                    await bot.sendMessage(chatId, `🚫 User @${msg.from.username || msg.from.first_name} dibanned karena 3 peringatan!`);
                    botData.statistics.totalBans++;
                }
                break;
                
            case 'RESTRICT_USER':
                const duration = decision.restriction_duration || '1d';
                const durationMs = parseDuration(duration);
                
                await bot.restrictChatMember(chatId, userId, {
                    can_send_messages: false,
                    can_send_media_messages: false,
                    can_send_polls: false,
                    can_send_other_messages: false,
                    can_add_web_page_previews: false,
                    can_change_info: false,
                    can_invite_users: false,
                    can_pin_messages: false,
                    until_date: Math.floor((Date.now() + durationMs) / 1000)
                });
                
                await bot.sendMessage(chatId, 
                    `🔇 User @${msg.from.username || msg.from.first_name} dibatasi selama ${duration}\n` +
                    `Alasan: ${decision.reason}`
                );
                botData.statistics.totalRestrictions++;
                break;
                
            case 'BAN_USER':
                await bot.banChatMember(chatId, userId);
                await bot.deleteMessage(chatId, messageId);
                await bot.sendMessage(chatId, 
                    `🚫 User @${msg.from.username || msg.from.first_name} dibanned!\n` +
                    `Alasan: ${decision.reason}`
                );
                botData.statistics.totalBans++;
                break;
        }
        
        // Add to suspicious users if severity > 5
        if (decision.severity > 5) {
            botData.statistics.suspiciousUsers.push({
                userId: userId,
                username: msg.from.username || msg.from.first_name,
                groupId: chatId,
                reason: decision.reason,
                severity: decision.severity,
                timestamp: new Date().toISOString()
            });
        }
        
        saveData(botData);
        
    } catch (error) {
        console.error('Error executing decision:', error);
    }
}

// Parse duration string to milliseconds
function parseDuration(duration) {
    const match = duration.match(/(\d+)([hdm])/);
    if (!match) return 86400000; // Default 1 day
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
        case 'h': return value * 3600000;
        case 'd': return value * 86400000;
        case 'm': return value * 60000;
        default: return 86400000;
    }
}

// Check if user has admin access
function isAdmin(userId) {
    return botData.admins.includes(userId);
}

// Check if group is managed
function isGroupManaged(groupId) {
    return botData.groups.includes(groupId);
}

// Main menu inline keyboard
function getMainMenu() {
    return {
        inline_keyboard: [
            [
                { text: '➕ Tambah Grup', callback_data: 'add_group' },
                { text: '➖ Del Grup', callback_data: 'del_group' }
            ],
            [
                { text: '🔍 Deteksi ON', callback_data: 'detection_on' },
                { text: '🔇 Deteksi OFF', callback_data: 'detection_off' }
            ],
            [
                { text: '📋 List Grup', callback_data: 'list_groups' },
                { text: '👥 Tambah Admin', callback_data: 'add_admin' }
            ],
            [
                { text: '📊 Statistik', callback_data: 'statistics' },
                { text: '🗑️ Del Admin', callback_data: 'del_admin' }
            ]
        ]
    };
}

// Handle /start command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, '❌ Anda tidak memiliki akses ke bot ini.');
    }
    
    const welcomeText = `🤖 **Bot Proteksi Grup AI**\n\n` +
        `Selamat datang Admin! Bot ini menggunakan AI untuk melindungi grup dari:\n` +
        `• Konten 18+ dan SARA\n` +
        `• Spam dan hate speech\n` +
        `• Gambar tidak pantas\n` +
        `• Perilaku mencurigakan\n\n` +
        `Status Deteksi: ${botData.detectionEnabled ? '🟢 AKTIF' : '🔴 NONAKTIF'}\n` +
        `Grup Dikelola: ${botData.groups.length}\n` +
        `Total Admin: ${botData.admins.length}`;
    
    bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'Markdown',
        reply_markup: getMainMenu()
    });
});

// Handle callback queries
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    if (!isAdmin(userId)) {
        return bot.answerCallbackQuery(callbackQuery.id, 'Akses ditolak!', true);
    }
    
    switch (data) {
        case 'add_group':
            bot.editMessageText('📝 Kirim ID grup yang ingin ditambahkan:\n\nContoh: -1001234567890', {
                chat_id: chatId,
                message_id: msg.message_id,
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'main_menu' }]]
                }
            });
            
            // Listen for next message
            const addGroupListener = (nextMsg) => {
                if (nextMsg.chat.id === chatId && nextMsg.from.id === userId) {
                    const groupId = parseInt(nextMsg.text);
                    if (isNaN(groupId)) {
                        bot.sendMessage(chatId, '❌ ID grup tidak valid!');
                    } else if (botData.groups.includes(groupId)) {
                        bot.sendMessage(chatId, '⚠️ Grup sudah ada dalam daftar!');
                    } else {
                        botData.groups.push(groupId);
                        saveData(botData);
                        bot.sendMessage(chatId, `✅ Grup ${groupId} berhasil ditambahkan!`, {
                            reply_markup: getMainMenu()
                        });
                    }
                    bot.removeListener('message', addGroupListener);
                }
            };
            bot.on('message', addGroupListener);
            break;
            
        case 'del_group':
            if (botData.groups.length === 0) {
                bot.answerCallbackQuery(callbackQuery.id, 'Tidak ada grup untuk dihapus!', true);
                return;
            }
            
            const groupButtons = botData.groups.map(groupId => [{
                text: `Grup: ${groupId}`,
                callback_data: `remove_group_${groupId}`
            }]);
            groupButtons.push([{ text: '🔙 Kembali', callback_data: 'main_menu' }]);
            
            bot.editMessageText('🗑️ Pilih grup yang ingin dihapus:', {
                chat_id: chatId,
                message_id: msg.message_id,
                reply_markup: { inline_keyboard: groupButtons }
            });
            break;
            
        case 'detection_on':
            botData.detectionEnabled = true;
            saveData(botData);
            bot.editMessageText('🟢 Deteksi AI diaktifkan untuk semua grup!', {
                chat_id: chatId,
                message_id: msg.message_id,
                reply_markup: getMainMenu()
            });
            break;
            
        case 'detection_off':
            botData.detectionEnabled = false;
            saveData(botData);
            bot.editMessageText('🔴 Deteksi AI dinonaktifkan!', {
                chat_id: chatId,
                message_id: msg.message_id,
                reply_markup: getMainMenu()
            });
            break;
            
        case 'list_groups':
            let groupList = '📋 **Daftar Grup Dikelola:**\n\n';
            if (botData.groups.length === 0) {
                groupList += 'Belum ada grup yang dikelola.';
            } else {
                botData.groups.forEach((groupId, index) => {
                    groupList += `${index + 1}. ID: \`${groupId}\`\n`;
                });
            }
            
            bot.editMessageText(groupList, {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'main_menu' }]]
                }
            });
            break;
            
        case 'add_admin':
            bot.editMessageText('👤 Kirim ID user yang ingin dijadikan admin:\n\nContoh: 123456789', {
                chat_id: chatId,
                message_id: msg.message_id,
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'main_menu' }]]
                }
            });
            
            const addAdminListener = (nextMsg) => {
                if (nextMsg.chat.id === chatId && nextMsg.from.id === userId) {
                    const adminId = parseInt(nextMsg.text);
                    if (isNaN(adminId)) {
                        bot.sendMessage(chatId, '❌ ID user tidak valid!');
                    } else if (botData.admins.includes(adminId)) {
                        bot.sendMessage(chatId, '⚠️ User sudah menjadi admin!');
                    } else {
                        botData.admins.push(adminId);
                        saveData(botData);
                        bot.sendMessage(chatId, `✅ User ${adminId} berhasil ditambahkan sebagai admin!`, {
                            reply_markup: getMainMenu()
                        });
                    }
                    bot.removeListener('message', addAdminListener);
                }
            };
            bot.on('message', addAdminListener);
            break;
            
        case 'del_admin':
            const nonMainAdmins = botData.admins.filter(id => id !== botData.mainAdmin);
            if (nonMainAdmins.length === 0) {
                bot.answerCallbackQuery(callbackQuery.id, 'Tidak ada admin yang bisa dihapus!', true);
                return;
            }
            
            const adminButtons = nonMainAdmins.map(adminId => [{
                text: `Admin: ${adminId}`,
                callback_data: `remove_admin_${adminId}`
            }]);
            adminButtons.push([{ text: '🔙 Kembali', callback_data: 'main_menu' }]);
            
            bot.editMessageText('🗑️ Pilih admin yang ingin dihapus:', {
                chat_id: chatId,
                message_id: msg.message_id,
                reply_markup: { inline_keyboard: adminButtons }
            });
            break;
            
        case 'statistics':
            const stats = botData.statistics;
            const statsText = `📊 **Statistik Bot**\n\n` +
                `🔢 Total Peringatan: ${stats.totalWarnings}\n` +
                `🚫 Total Ban: ${stats.totalBans}\n` +
                `🔇 Total Pembatasan: ${stats.totalRestrictions}\n` +
                `🗑️ Pesan Dihapus: ${stats.totalDeletedMessages}\n` +
                `⚠️ User Mencurigakan: ${stats.suspiciousUsers.length}\n\n` +
                `📅 Status: ${botData.detectionEnabled ? '🟢 Aktif' : '🔴 Nonaktif'}\n` +
                `🏢 Grup Dikelola: ${botData.groups.length}\n` +
                `👥 Total Admin: ${botData.admins.length}`;
            
            bot.editMessageText(statsText, {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📋 Lihat User Mencurigakan', callback_data: 'suspicious_users' }],
                        [{ text: '🔙 Kembali', callback_data: 'main_menu' }]
                    ]
                }
            });
            break;
            
        case 'suspicious_users':
            let suspiciousText = '⚠️ **User Mencurigakan:**\n\n';
            if (botData.statistics.suspiciousUsers.length === 0) {
                suspiciousText += 'Tidak ada user mencurigakan.';
            } else {
                botData.statistics.suspiciousUsers.slice(-10).forEach((user, index) => {
                    suspiciousText += `${index + 1}. **${user.username}** (${user.userId})\n`;
                    suspiciousText += `   Grup: ${user.groupId}\n`;
                    suspiciousText += `   Alasan: ${user.reason}\n`;
                    suspiciousText += `   Tingkat: ${user.severity}/10\n`;
                    suspiciousText += `   Waktu: ${new Date(user.timestamp).toLocaleString()}\n\n`;
                });
            }
            
            bot.editMessageText(suspiciousText, {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'statistics' }]]
                }
            });
            break;
            
        case 'main_menu':
            const mainText = `🤖 **Bot Proteksi Grup AI**\n\n` +
                `Status Deteksi: ${botData.detectionEnabled ? '🟢 AKTIF' : '🔴 NONAKTIF'}\n` +
                `Grup Dikelola: ${botData.groups.length}\n` +
                `Total Admin: ${botData.admins.length}`;
            
            bot.editMessageText(mainText, {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: getMainMenu()
            });
            break;
            
        default:
            if (data.startsWith('remove_group_')) {
                const groupIdToRemove = parseInt(data.replace('remove_group_', ''));
                botData.groups = botData.groups.filter(id => id !== groupIdToRemove);
                saveData(botData);
                bot.editMessageText(`✅ Grup ${groupIdToRemove} berhasil dihapus!`, {
                    chat_id: chatId,
                    message_id: msg.message_id,
                    reply_markup: getMainMenu()
                });
            } else if (data.startsWith('remove_admin_')) {
                const adminIdToRemove = parseInt(data.replace('remove_admin_', ''));
                if (adminIdToRemove !== botData.mainAdmin) {
                    botData.admins = botData.admins.filter(id => id !== adminIdToRemove);
                    saveData(botData);
                    bot.editMessageText(`✅ Admin ${adminIdToRemove} berhasil dihapus!`, {
                        chat_id: chatId,
                        message_id: msg.message_id,
                        reply_markup: getMainMenu()
                    });
                }
            }
            break;
    }
    
    bot.answerCallbackQuery(callbackQuery.id);
});

// Handle new chat members (bot invited to group)
bot.on('new_chat_members', async (msg) => {
    const chatId = msg.chat.id;
    const newMembers = msg.new_chat_members;
    
    // Check if bot was added
    const botAdded = newMembers.some(member => member.id === parseInt(BOT_TOKEN.split(':')[0]));
    
    if (botAdded) {
        const inviterId = msg.from.id;
        
        // Check if inviter is admin and group is in managed list
        if (!isAdmin(inviterId)) {
            await bot.sendMessage(chatId, 
                '❌ Maaf, bot ini hanya bisa digunakan oleh admin yang terdaftar.\n' +
                'Silakan hubungi admin bot untuk mendapatkan akses.'
            );
            
            // Leave group after 10 seconds
            setTimeout(async () => {
                try {
                    await bot.leaveChat(chatId);
                } catch (error) {
                    console.error('Error leaving chat:', error);
                }
            }, 10000);
            
            return;
        }
        
        if (!isGroupManaged(chatId)) {
            await bot.sendMessage(chatId, 
                '⚠️ Grup ini belum terdaftar dalam daftar grup yang dikelola.\n' +
                'Bot akan otomatis keluar dalam 10 detik.\n' +
                'Silakan tambahkan grup ini melalui panel admin bot.'
            );
            
            setTimeout(async () => {
                try {
                    await bot.leaveChat(chatId);
                } catch (error) {
                    console.error('Error leaving chat:', error);
                }
            }, 10000);
            
            return;
        }
        
        // Check if bot has admin rights
        try {
            const chatMember = await bot.getChatMember(chatId, parseInt(BOT_TOKEN.split(':')[0]));
            
            if (chatMember.status !== 'administrator') {
                await bot.sendMessage(chatId, 
                    '⚠️ Bot tidak memiliki hak admin di grup ini.\n' +
                    'Bot tidak akan bekerja maksimal tanpa hak admin.\n' +
                    'Silakan jadikan bot sebagai admin untuk fitur lengkap.'
                );
            } else {
                await bot.sendMessage(chatId, 
                    '✅ Bot siap melindungi grup ini!\n\n' +
                    '🤖 AI Protection System AKTIF\n' +
                    '🔍 Monitoring: Konten 18+, SARA, Spam\n' +
                    '🛡️ Auto Action: Peringatan, Restrict, Ban\n' +
                    '📊 Laporan harian akan dikirim ke admin\n\n' +
                    'Bot bekerja maksimal! 🚀'
                );
            }
        } catch (error) {
            console.error('Error checking bot admin status:', error);
        }
    }
});

// Handle all messages in groups
bot.on('message', async (msg) => {
    // Skip if not in group or detection disabled
    if (msg.chat.type === 'private' || !botData.detectionEnabled) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Skip if group not managed or user is admin
    if (!isGroupManaged(chatId) || isAdmin(userId)) return;
    
    // Skip bot messages
    if (msg.from.is_bot) return;
    
    try {
        // Check for spam
        if (detectSpam(userId, chatId)) {
            await bot.restrictChatMember(chatId, userId, {
                can_send_messages: false,
                until_date: Math.floor((Date.now() + 3600000) / 1000) // 1 hour
            });
            
            await bot.sendMessage(chatId, 
                `🚫 @${msg.from.username || msg.from.first_name} dibatasi karena spam!`
            );
            
            botData.statistics.totalRestrictions++;
            saveData(botData);
            return;
        }
        
        let imageUrl = null;
        let messageText = msg.text || msg.caption || '';
        
        // Handle photos
        if (msg.photo) {
            try {
                const fileId = msg.photo[msg.photo.length - 1].file_id;
                const file = await bot.getFile(fileId);
                const photoBuffer = await bot.downloadFile(file.file_id, './');
                
                // Upload to ImgBB
                imageUrl = await uploadToImgBB(photoBuffer);
                
                // Clean up local file
                if (fs.existsSync(file.file_path)) {
                    fs.unlinkSync(file.file_path);
                }
            } catch (error) {
                console.error('Error processing photo:', error);
            }
        }
        
        // Skip if no content to analyze
        if (!messageText.trim() && !imageUrl) return;
        
        // Analyze with AI
        const decision = await analyzeWithAI(messageText, imageUrl, chatId);
        
        if (decision && decision.decision !== 'SAFE') {
            await executeDecision(decision, msg, decision.reason);
        }
        
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

// Daily report function
// Lanjutan dari kode sebelumnya...

// Daily report function
function sendDailyReport() {
    const stats = botData.statistics;
    const reportText = `📊 **Laporan Harian Bot Proteksi**\n\n` +
        `📅 Tanggal: ${new Date().toLocaleDateString()}\n\n` +
        `📈 **Statistik Hari Ini:**\n` +
        `• Peringatan: ${stats.totalWarnings}\n` +
        `• Pembatasan: ${stats.totalRestrictions}\n` +
        `• Ban: ${stats.totalBans}\n` +
        `• Pesan Dihapus: ${stats.totalDeletedMessages}\n` +
        `• User Mencurigakan: ${stats.suspiciousUsers.length}\n\n` +
        `🏢 Grup Aktif: ${botData.groups.length}\n` +
        `🤖 Status: ${botData.detectionEnabled ? 'Aktif' : 'Nonaktif'}`;
    
    // Send to all admins
    botData.admins.forEach(adminId => {
        bot.sendMessage(adminId, reportText, { parse_mode: 'Markdown' }).catch(console.error);
    });
    
    // Reset daily statistics
    botData.statistics.dailyReports.push({
        date: new Date().toISOString(),
        warnings: stats.totalWarnings,
        restrictions: stats.totalRestrictions,
        bans: stats.totalBans,
        deletedMessages: stats.totalDeletedMessages,
        suspiciousUsers: stats.suspiciousUsers.length
    });
    
    // Keep only last 30 days of reports
    if (botData.statistics.dailyReports.length > 30) {
        botData.statistics.dailyReports = botData.statistics.dailyReports.slice(-30);
    }
    
    saveData(botData);
}

// Schedule daily report at 23:59 every day
function scheduleDailyReport() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(23, 59, 0, 0);
    
    const msUntilReport = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
        sendDailyReport();
        // Schedule next report
        setInterval(sendDailyReport, 24 * 60 * 60 * 1000); // Every 24 hours
    }, msUntilReport);
}

// Handle left chat member (when bot is removed)
bot.on('left_chat_member', async (msg) => {
    const leftMember = msg.left_chat_member;
    const chatId = msg.chat.id;
    
    // If bot was removed, remove from managed groups
    if (leftMember.id === parseInt(BOT_TOKEN.split(':')[0])) {
        botData.groups = botData.groups.filter(groupId => groupId !== chatId);
        saveData(botData);
        
        // Notify admins
        const notificationText = `🚪 Bot telah dikeluarkan dari grup ${chatId}`;
        botData.admins.forEach(adminId => {
            bot.sendMessage(adminId, notificationText).catch(console.error);
        });
    }
});

// Handle document uploads
bot.on('document', async (msg) => {
    if (msg.chat.type === 'private' || !botData.detectionEnabled) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isGroupManaged(chatId) || isAdmin(userId) || msg.from.is_bot) return;
    
    try {
        const fileName = msg.document.file_name || '';
        const fileSize = msg.document.file_size || 0;
        const caption = msg.caption || '';
        
        // Check for suspicious file types
        const suspiciousExtensions = ['.exe', '.scr', '.bat', '.cmd', '.com', '.pif', '.vbs', '.jar'];
        const isSuspicious = suspiciousExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
        
        if (isSuspicious || fileSize > 50 * 1024 * 1024) { // >50MB
            await bot.deleteMessage(chatId, msg.message_id);
            await bot.sendMessage(chatId, 
                `🚫 File berbahaya terdeteksi dari @${msg.from.username || msg.from.first_name}!\n` +
                `File: ${fileName}\n` +
                `Alasan: ${isSuspicious ? 'Ekstensi berbahaya' : 'File terlalu besar'}`
            );
            
            botData.statistics.totalDeletedMessages++;
            saveData(botData);
            return;
        }
        
        // Analyze caption if exists
        if (caption.trim()) {
            const decision = await analyzeWithAI(caption, null, chatId);
            if (decision && decision.decision !== 'SAFE') {
                await executeDecision(decision, msg, decision.reason);
            }
        }
        
    } catch (error) {
        console.error('Error processing document:', error);
    }
});

// Handle stickers
bot.on('sticker', async (msg) => {
    if (msg.chat.type === 'private' || !botData.detectionEnabled) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isGroupManaged(chatId) || isAdmin(userId) || msg.from.is_bot) return;
    
    try {
        // Check for spam stickers
        if (detectSpam(userId, chatId)) {
            await bot.restrictChatMember(chatId, userId, {
                can_send_messages: false,
                until_date: Math.floor((Date.now() + 1800000) / 1000) // 30 minutes
            });
            
            await bot.sendMessage(chatId, 
                `🚫 @${msg.from.username || msg.from.first_name} dibatasi karena spam sticker!`
            );
            
            botData.statistics.totalRestrictions++;
            saveData(botData);
        }
        
    } catch (error) {
        console.error('Error processing sticker:', error);
    }
});

// Handle video messages
bot.on('video', async (msg) => {
    if (msg.chat.type === 'private' || !botData.detectionEnabled) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isGroupManaged(chatId) || isAdmin(userId) || msg.from.is_bot) return;
    
    try {
        const caption = msg.caption || '';
        const duration = msg.video.duration || 0;
        const fileSize = msg.video.file_size || 0;
        
        // Check for large videos (>100MB)
        if (fileSize > 100 * 1024 * 1024) {
            await bot.deleteMessage(chatId, msg.message_id);
            await bot.sendMessage(chatId, 
                `🚫 Video terlalu besar dari @${msg.from.username || msg.from.first_name}!`
            );
            
            botData.statistics.totalDeletedMessages++;
            saveData(botData);
            return;
        }
        
        // Analyze caption if exists
        if (caption.trim()) {
            const decision = await analyzeWithAI(caption, null, chatId);
            if (decision && decision.decision !== 'SAFE') {
                await executeDecision(decision, msg, decision.reason);
            }
        }
        
    } catch (error) {
        console.error('Error processing video:', error);
    }
});

// Handle voice messages
bot.on('voice', async (msg) => {
    if (msg.chat.type === 'private' || !botData.detectionEnabled) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isGroupManaged(chatId) || isAdmin(userId) || msg.from.is_bot) return;
    
    try {
        // Check for spam voice messages
        if (detectSpam(userId, chatId)) {
            await bot.restrictChatMember(chatId, userId, {
                can_send_messages: false,
                until_date: Math.floor((Date.now() + 3600000) / 1000) // 1 hour
            });
            
            await bot.sendMessage(chatId, 
                `🚫 @${msg.from.username || msg.from.first_name} dibatasi karena spam voice note!`
            );
            
            botData.statistics.totalRestrictions++;
            saveData(botData);
        }
        
    } catch (error) {
        console.error('Error processing voice:', error);
    }
});

// Handle forwarded messages
bot.on('message', async (msg) => {
    if (msg.chat.type === 'private' || !botData.detectionEnabled) return;
    if (!msg.forward_from && !msg.forward_from_chat) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isGroupManaged(chatId) || isAdmin(userId) || msg.from.is_bot) return;
    
    try {
        // Check for forwarded messages from suspicious channels/bots
        const forwardFrom = msg.forward_from_chat || msg.forward_from;
        
        if (forwardFrom && forwardFrom.type === 'channel') {
            // Analyze forwarded content
            const messageText = msg.text || msg.caption || '';
            if (messageText.trim()) {
                const decision = await analyzeWithAI(messageText, null, chatId);
                if (decision && decision.decision !== 'SAFE') {
                    await executeDecision(decision, msg, decision.reason);
                }
            }
        }
        
    } catch (error) {
        console.error('Error processing forwarded message:', error);
    }
});

// Advanced user behavior analysis
function analyzeUserBehavior(userId, chatId) {
    const key = `${userId}_${chatId}`;
    const warningCount = botData.userWarnings[key] || 0;
    const spamCount = botData.spamDetection[key] ? botData.spamDetection[key].length : 0;
    
    // Calculate suspicion score
    let suspicionScore = 0;
    suspicionScore += warningCount * 2; // Each warning adds 2 points
    suspicionScore += Math.max(0, spamCount - 5); // Spam messages over 5 add points
    
    return {
        warningCount,
        spamCount,
        suspicionScore,
        isSuspicious: suspicionScore > 5
    };
}

// Cleanup old data periodically
function cleanupOldData() {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    // Clean old spam detection data
    Object.keys(botData.spamDetection).forEach(key => {
        botData.spamDetection[key] = botData.spamDetection[key].filter(time => now - time < 3600000); // Keep 1 hour
        if (botData.spamDetection[key].length === 0) {
            delete botData.spamDetection[key];
        }
    });
    
    // Clean old suspicious users (keep only last week)
    botData.statistics.suspiciousUsers = botData.statistics.suspiciousUsers.filter(user => {
        return new Date(user.timestamp).getTime() > oneWeekAgo;
    });
    
    saveData(botData);
}

// Enhanced error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
    
    // Notify main admin about critical errors
    if (error.code === 'EFATAL') {
        bot.sendMessage(botData.mainAdmin, 
            `🚨 **Bot Error Critical!**\n\n` +
            `Error: ${error.message}\n` +
            `Time: ${new Date().toISOString()}\n\n` +
            `Bot mungkin perlu restart!`
        , { parse_mode: 'Markdown' }).catch(console.error);
    }
});

// Handle webhook errors
bot.on('webhook_error', (error) => {
    console.error('Webhook error:', error);
});

// Initialize bot
function initializeBot() {
    console.log('🚀 Bot Protection AI Started!');
    console.log('📊 Data loaded:', {
        admins: botData.admins.length,
        groups: botData.groups.length,
        detectionEnabled: botData.detectionEnabled
    });
    
    // Schedule daily report
    scheduleDailyReport();
    
    // Schedule cleanup every hour
    setInterval(cleanupOldData, 60 * 60 * 1000);
    
    // Send startup notification to main admin
    bot.sendMessage(botData.mainAdmin, 
        `🤖 **Bot Protection AI Started!**\n\n` +
        `✅ Status: Online\n` +
        `🔍 Detection: ${botData.detectionEnabled ? 'Enabled' : 'Disabled'}\n` +
        `👥 Admins: ${botData.admins.length}\n` +
        `🏢 Groups: ${botData.groups.length}\n` +
        `📅 Time: ${new Date().toLocaleString()}`
    , { parse_mode: 'Markdown' }).catch(console.error);
}

// Enhanced session management
function getOrCreateSession(groupId) {
    if (!botData.sessions[groupId]) {
        botData.sessions[groupId] = `group_${groupId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        saveData(botData);
    }
    return botData.sessions[groupId];
}

// Better image processing with multiple attempts
async function processImage(photoArray) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const fileId = photoArray[photoArray.length - 1].file_id;
            const file = await bot.getFile(fileId);
            
            // Download file
            const response = await axios.get(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`, {
                responseType: 'arraybuffer'
            });
            
            const buffer = Buffer.from(response.data);
            
            // Upload to ImgBB
            const imageUrl = await uploadToImgBB(buffer);
            
            if (imageUrl) {
                return imageUrl;
            }
        } catch (error) {
            console.error(`Image processing attempt ${attempt + 1} failed:`, error);
            if (attempt === 2) {
                throw error;
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    return null;
}

// Enhanced AI decision with context
async function analyzeWithContext(text, imageUrl, groupId, userId, messageType = 'text') {
    try {
        const session = getOrCreateSession(groupId);
        const userBehavior = analyzeUserBehavior(userId, groupId);
        
        const contextPrompt = `Kamu adalah AI Security Bot untuk grup Telegram. Analisis konten ini dengan konteks user behavior.

USER CONTEXT:
- Peringatan sebelumnya: ${userBehavior.warningCount}
- Spam count: ${userBehavior.spamCount}
- Suspicion score: ${userBehavior.suspicionScore}
- Type: ${messageType}

DETEKSI:
- Konten 18+, SARA, hate speech, scam, phishing
- Spam, flood, bot behavior
- Gambar tidak pantas, kekerasan, pornografi
- Link mencurigakan, malware
- Perilaku toxic, bullying

KEPUTUSAN TERSEDIA:
- SAFE: Konten aman
- DELETE_MESSAGE: Hapus pesan berbahaya
- WARN_USER: Beri peringatan
- RESTRICT_USER: Batasi user (1h-30d)
- BAN_USER: Ban permanen untuk konten sangat berbahaya

WAJIB FORMAT JSON:
{
  "decision": "SAFE/DELETE_MESSAGE/WARN_USER/RESTRICT_USER/BAN_USER",
  "reason": "alasan spesifik dan jelas",
  "severity": 1-10,
  "confidence": 1-10,
  "restriction_duration": "1h/6h/1d/7d/30d",
  "message_to_user": "pesan untuk user",
  "threat_type": "spam/18+/sara/hate/scam/toxic/malware/safe"
}

Konten: ${text}`;

        const apiUrl = imageUrl 
            ? `https://api.ryzumi.vip/api/ai/v2/chatgpt?text=${encodeURIComponent(contextPrompt)}&imageUrl=${encodeURIComponent(imageUrl)}&session=${session}`
            : `https://api.ryzumi.vip/api/ai/v2/chatgpt?text=${encodeURIComponent(contextPrompt)}&session=${session}`;

        const response = await axios.get(apiUrl, { timeout: 15000 });
        
        if (response.data && response.data.result) {
            try {
                // Extract JSON from response
                const jsonMatch = response.data.result.match(/\{[\s\S]*?\}/);
                if (jsonMatch) {
                    const decision = JSON.parse(jsonMatch[0]);
                    
                    // Validate decision structure
                    if (decision.decision && decision.reason && decision.severity) {
                        return decision;
                    }
                }
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
            }
        }
        
        // Fallback decision
        return {
            decision: 'SAFE',
            reason: 'Tidak dapat menganalisis dengan benar',
            severity: 1,
            confidence: 1,
            threat_type: 'safe'
        };
        
    } catch (error) {
        console.error('Error in AI analysis:', error);
        return null;
    }
}

// Start the bot
initializeBot();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Bot shutting down...');
    
    // Send shutdown notification
    bot.sendMessage(botData.mainAdmin, 
        '🔴 **Bot Protection AI Shutdown**\n\n' +
        '⏰ Time: ' + new Date().toLocaleString()
    , { parse_mode: 'Markdown' }).catch(console.error);
    
    // Save data before exit
    saveData(botData);
    
    setTimeout(() => {
        process.exit(0);
    }, 2000);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    
    // Notify admin about critical error
    bot.sendMessage(botData.mainAdmin, 
        `🚨 **Critical Error!**\n\n` +
        `${error.message}\n\n` +
        `Time: ${new Date().toISOString()}`
    , { parse_mode: 'Markdown' }).catch(console.error);
});

console.log('🎯 Telegram Protection Bot is running!');
console.log('📱 Features: AI Detection, Auto Moderation, Daily Reports');
console.log('🛡️ Ready to protect your groups!');

module.exports = bot;
