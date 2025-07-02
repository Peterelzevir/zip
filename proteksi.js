const TelegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');
const fs = require('fs');

// Bot Configuration
const BOT_TOKEN = '7566921062:AAHJ4ij3ObZA9Rl8lfrhuZ5KTZaY82gKeHA'; // Ganti dengan token bot Anda
const MAIN_ADMIN = 5988451717; // Ganti dengan user ID admin utama

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Data Storage
let botData = {
    admins: [MAIN_ADMIN],
    allowedGroups: new Set(),
    bannedUsers: new Map(),
    userMessages: new Map(),
    messageHashes: new Map(),
    detectionEnabled: true,
    lockdownMode: false,
    userViolations: new Map()
};

// Spam Detection Patterns (Bahasa Indonesia)
const SPAM_PATTERNS = [
    // Investasi Bodong
    /(?:investasi|bisnis)\s*(?:cepat|mudah|instan|tanpa\s*modal|profit|keuntungan)\s*(?:milyar|jutaan|puluhan|ratusan)/gi,
    /(?:daftar|join|gabung)\s*(?:sekarang|langsung)\s*(?:profit|untung|bonus)/gi,
    /(?:modal|deposit)\s*(?:kecil|minim|sedikit)\s*(?:untung|profit)\s*(?:besar|maksimal)/gi,
    /(?:robot|bot|trading)\s*(?:forex|saham|crypto)\s*(?:profit|untung)\s*(?:pasti|dijamin)/gi,
    /(?:binary|option|olymp|quotex|binomo|iq\s*option)/gi,
    
    // MLM dan Skema Piramida
    /(?:sistem|bisnis)\s*(?:referal|referral|downline|upline)/gi,
    /(?:passive\s*income|penghasilan\s*pasif|uang\s*tidur)/gi,
    /(?:matrix|level|tingkat)\s*(?:bonus|komisi|reward)/gi,
    /(?:recruit|rekrut|ajak|cari)\s*(?:member|anggota|orang)\s*(?:untung|bonus)/gi,
    
    // Konten Dewasa/18+
    /(?:bokep|porno|porn|xxx|sex|ngentot|kontol|memek|pepek|toket|payudara)/gi,
    /(?:livestream|live)\s*(?:bugil|telanjang|hot|sexy)/gi,
    /(?:video|foto)\s*(?:bugil|panas|hot|dewasa)/gi,
    /(?:cewek|cewe|cwk)\s*(?:sange|horny|nakal|gatal)/gi,
    
    // SARA dan Ujaran Kebencian
    /(?:kafir|infidel|murtad|sesat|haram)\s*(?:bangsa|suku|agama)/gi,
    /(?:china|cina|chindo|pribumi)\s*(?:bangsat|anjing|babi|monyet)/gi,
    /(?:islam|kristen|hindu|budha)\s*(?:sesat|salah|bodoh|tolol)/gi,
    /(?:jawa|sunda|batak|dayak|papua)\s*(?:primitif|terbelakang|bodoh)/gi,
    
    // Kata Kasar dan Toxic
    /(?:anjing|bangsat|babi|monyet|tolol|bodoh|goblok|idiot)\s*(?:lu|lo|kamu|elu)/gi,
    /(?:mampus|mati|bunuh)\s*(?:aja|saja|lu|lo|kamu)/gi,
    /(?:kontol|memek|pepek|ngentot|fuck|shit|damn)\s*(?:lu|lo|banget)/gi,
    /(?:sialan|sial|kurang\s*ajar|brengsek|bajingan)/gi,
    
    // Penipuan dan Scam
    /(?:transfer|kirim)\s*(?:uang|dana|saldo)\s*(?:dulu|diawal|dimuka)/gi,
    /(?:admin|cs|customer\s*service)\s*(?:transfer|tf|kirim)\s*(?:fee|biaya)/gi,
    /(?:survey|kuis|quiz)\s*(?:berhadiah|hadiah|prize)\s*(?:jutaan|puluhan)/gi,
    /(?:undian|lottery|lotre)\s*(?:menang|winner|juara)\s*(?:milyar|jutaan)/gi,
    
    // Pelecehan dan Harassment
    /(?:buka|lepas|copot)\s*(?:baju|celana|cd|bh)/gi,
    /(?:cium|peluk|raba|pegang)\s*(?:toket|payudara|paha|bokong)/gi,
    /(?:sugar\s*daddy|sugar\s*baby|open\s*bo|escort)/gi,
    /(?:pijat|massage)\s*(?:plus|special|hot|dewasa)/gi,
    
    // Kekerasan
    /(?:bunuh|habisi|siksa|aniaya|pukul|hajar)\s*(?:sampai|hingga)\s*(?:mati|tewas)/gi,
    /(?:bom|ledak|bakar|ancam)\s*(?:rumah|kantor|tempat)/gi,
    /(?:bacok|tikam|tembak|bunuh)\s*(?:orang|dia|mereka)/gi,
    
    // Judi Online
    /(?:slot|casino|poker|domino)\s*(?:online|uang\s*asli)/gi,
    /(?:togel|lottery|4d|3d|2d)\s*(?:online|terpercaya|resmi)/gi,
    /(?:situs|link|daftar)\s*(?:judi|bet|betting)\s*(?:terpercaya|aman)/gi,
    
    // Link Mencurigakan
    /(?:klik|click|buka)\s*(?:link|url)\s*(?:ini|dibawah|berikut)/gi,
    /(?:bit\.ly|tinyurl|short\.link|t\.me\/\+)/gi,
    /(?:daftar|register|signup)\s*(?:disini|here|sekarang)/gi,
    
    // Spam Umum
    /(?:promo|diskon|gratis|free)\s*(?:terbatas|limited|hari\s*ini)/gi,
    /(?:wa|whatsapp|telegram)\s*(?:admin|cs)\s*(?:untuk|buat)\s*(?:info|order)/gi,
    /(?:hubungi|contact|chat)\s*(?:nomor|wa|telegram)\s*(?:dibawah|berikut)/gi
];

// Message Templates
const MESSAGES = {
    welcome: {
        text: `🛡️ <b>SECURITY BOT PREMIUM ACTIVATED</b>

✨ <i>Bot keamanan premium telah diaktifkan di grup ini</i>

🔰 <b>Fitur Keamanan:</b>
• Deteksi Investasi Bodong & MLM
• Filter Konten Dewasa/SARA
• Anti-Spam & Duplicate Messages
• Rate Limiting Canggih
• Analisis Forward Messages
• Hash Image Verification
• Auto-Moderation System

⚡ <b>Status:</b> <code>READY TO PROTECT</code>
🎯 <b>Mode:</b> <code>AUTO-DETECTION ON</code>

<i>Grup Anda sekarang terlindungi 24/7!</i>`,
        parse_mode: 'HTML'
    },
    
    needAdmin: {
        text: `⚠️ <b>AKSES TERBATAS TERDETEKSI</b>

🔧 <i>Bot memerlukan hak admin untuk bekerja optimal</i>

📋 <b>Permissions Required:</b>
• Delete Messages ✅
• Ban/Restrict Users ✅  
• Manage Chat ✅
• Pin Messages ✅

🎯 <b>Action Required:</b>
<i>Berikan hak admin kepada bot untuk aktivasi penuh sistem keamanan premium</i>

⏳ <code>Menunggu akses admin...</code>`,
        parse_mode: 'HTML'
    },
    
    maxProtection: {
        text: `🚀 <b>MAXIMUM PROTECTION ENABLED</b>

🛡️ <i>Sistem keamanan premium beroperasi pada kapasitas penuh</i>

✅ <b>Active Security Features:</b>
• Real-time Content Analysis
• Advanced Pattern Detection  
• Smart Anti-Spam System
• Auto-Moderation Engine
• Emergency Lockdown Ready

🎯 <b>Status:</b> <code>FULLY OPERATIONAL</code>
⚡ <b>Protection Level:</b> <code>MAXIMUM</code>

<i>Grup Anda mendapat perlindungan maksimal!</i>`,
        parse_mode: 'HTML'
    },
    
    unauthorized: {
        text: `🚫 <b>ACCESS DENIED</b>

⚠️ <i>Bot belum diotorisasi untuk grup ini</i>

📞 <b>Solusi:</b>
<i>Hubungi admin bot untuk mendaftarkan grup ini ke dalam whitelist</i>

⏰ <b>Auto-Exit:</b> <code>10 detik</code>

🔒 <i>Sistem keamanan premium - Akses terbatas</i>`,
        parse_mode: 'HTML'
    },
    
    banned: {
        text: `🔨 <b>USER RESTRICTED</b>

⚠️ <i>Anda telah dibatasi karena melanggar aturan grup</i>

⏰ <b>Durasi:</b> <code>24 jam</code>
📋 <b>Alasan:</b> <code>Multiple violations detected</code>

🎯 <b>Action:</b> <i>Tidak dapat mengirim pesan sementara waktu</i>

<i>Harap patuhi aturan grup untuk pengalaman yang lebih baik</i>`,
        parse_mode: 'HTML'
    }
};

// Inline Keyboards
const ADMIN_KEYBOARD = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '👥 Kelola Admin', callback_data: 'manage_admins' },
                { text: '🏢 Kelola Grup', callback_data: 'manage_groups' }
            ],
            [
                { text: '🛡️ Deteksi ON/OFF', callback_data: 'toggle_detection' },
                { text: '🔒 Mode Lockdown', callback_data: 'toggle_lockdown' }
            ],
            [
                { text: '📊 Statistik', callback_data: 'stats' },
                { text: '🧹 Bersihkan Data', callback_data: 'cleanup' }
            ],
            [
                { text: '❌ Tutup Menu', callback_data: 'close_menu' }
            ]
        ]
    }
};

const ADMIN_MANAGE_KEYBOARD = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '➕ Tambah Admin', callback_data: 'add_admin' },
                { text: '➖ Hapus Admin', callback_data: 'remove_admin' }
            ],
            [
                { text: '📋 List Admin', callback_data: 'list_admins' }
            ],
            [
                { text: '🔙 Kembali', callback_data: 'back_main' }
            ]
        ]
    }
};

const GROUP_MANAGE_KEYBOARD = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '➕ Tambah Grup', callback_data: 'add_group' },
                { text: '➖ Hapus Grup', callback_data: 'remove_group' }
            ],
            [
                { text: '📋 List Grup', callback_data: 'list_groups' }
            ],
            [
                { text: '🔙 Kembali', callback_data: 'back_main' }
            ]
        ]
    }
};

// Utility Functions
function isAdmin(userId) {
    return botData.admins.includes(userId);
}

function isMainAdmin(userId) {
    return userId === MAIN_ADMIN;
}

function calculateMessageHash(message) {
    const content = message.text || message.caption || '';
    return crypto.createHash('md5').update(content).digest('hex');
}

function calculateImageHash(photoSizes) {
    if (!photoSizes || photoSizes.length === 0) return null;
    const largestPhoto = photoSizes[photoSizes.length - 1];
    return crypto.createHash('md5').update(largestPhoto.file_id).digest('hex');
}

function detectSpamPatterns(text) {
    if (!text) return false;
    return SPAM_PATTERNS.some(pattern => pattern.test(text));
}

function isRateLimited(userId) {
    const now = Date.now();
    const userHistory = botData.userMessages.get(userId) || [];
    
    // Clean old messages (older than 1 minute)
    const recentMessages = userHistory.filter(time => now - time < 60000);
    botData.userMessages.set(userId, recentMessages);
    
    // Check if user exceeded rate limit (more than 10 messages per minute)
    return recentMessages.length > 10;
}

function addViolation(userId, chatId) {
    const key = `${userId}_${chatId}`;
    const violations = botData.userViolations.get(key) || 0;
    botData.userViolations.set(key, violations + 1);
    
    if (violations >= 20) {
        banUser(userId, chatId);
        botData.userViolations.set(key, 0);
    }
}

function banUser(userId, chatId) {
    const banUntil = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
    botData.bannedUsers.set(`${userId}_${chatId}`, banUntil);
    
    bot.restrictChatMember(chatId, userId, {
        permissions: {
            can_send_messages: false,
            can_send_media_messages: false,
            can_send_polls: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
            can_change_info: false,
            can_invite_users: false,
            can_pin_messages: false
        },
        until_date: Math.floor(banUntil / 1000)
    }).catch(console.error);
    
    // Send ban notification
    bot.sendMessage(chatId, MESSAGES.banned.text, { parse_mode: MESSAGES.banned.parse_mode })
        .catch(console.error);
}

function isBanned(userId, chatId) {
    const banKey = `${userId}_${chatId}`;
    const banUntil = botData.bannedUsers.get(banKey);
    
    if (banUntil && Date.now() < banUntil) {
        return true;
    } else if (banUntil) {
        botData.bannedUsers.delete(banKey);
    }
    
    return false;
}

function checkDuplicateMessage(userId, messageHash, chatId) {
    const key = `${userId}_${chatId}`;
    const userHashes = botData.messageHashes.get(key) || [];
    
    // Clean old hashes (older than 5 minutes)
    const now = Date.now();
    const recentHashes = userHashes.filter(item => now - item.timestamp < 300000);
    
    // Check for duplicate
    const isDuplicate = recentHashes.some(item => item.hash === messageHash);
    
    if (isDuplicate) {
        return true;
    }
    
    // Add new hash
    recentHashes.push({ hash: messageHash, timestamp: now });
    botData.messageHashes.set(key, recentHashes);
    
    return false;
}

// Bot Event Handlers
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const messageId = msg.message_id;
    
    // Skip if not a group
    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
        if (isAdmin(userId)) {
            bot.sendMessage(chatId, '🛡️ <b>SECURITY BOT PREMIUM</b>\n\n<i>Gunakan menu di bawah untuk mengelola bot</i>', {
                parse_mode: 'HTML',
                ...ADMIN_KEYBOARD
            });
        }
        return;
    }
    
    // Check if group is authorized
    if (!botData.allowedGroups.has(chatId.toString())) {
        await bot.sendMessage(chatId, MESSAGES.unauthorized.text, { parse_mode: MESSAGES.unauthorized.parse_mode });
        setTimeout(() => {
            bot.leaveChat(chatId).catch(console.error);
        }, 10000);
        return;
    }
    
    // Skip admin messages
    if (isAdmin(userId)) return;
    
    // Check if user is banned
    if (isBanned(userId, chatId)) {
        bot.deleteMessage(chatId, messageId).catch(console.error);
        return;
    }
    
    // Skip if detection is disabled
    if (!botData.detectionEnabled) return;
    
    // Skip if lockdown mode is active
    if (botData.lockdownMode) {
        bot.deleteMessage(chatId, messageId).catch(console.error);
        return;
    }
    
    // Rate limiting check
    if (isRateLimited(userId)) {
        bot.deleteMessage(chatId, messageId).catch(console.error);
        addViolation(userId, chatId);
        return;
    }
    
    // Update user message history
    const userHistory = botData.userMessages.get(userId) || [];
    userHistory.push(Date.now());
    botData.userMessages.set(userId, userHistory);
    
    let shouldDelete = false;
    
    // Check for spam patterns
    const messageText = msg.text || msg.caption || '';
    if (detectSpamPatterns(messageText)) {
        shouldDelete = true;
    }
    
    // Check for duplicate messages
    const messageHash = calculateMessageHash(msg);
    if (checkDuplicateMessage(userId, messageHash, chatId)) {
        shouldDelete = true;
    }
    
    // Check for duplicate images
    if (msg.photo) {
        const imageHash = calculateImageHash(msg.photo);
        if (imageHash && checkDuplicateMessage(userId, imageHash, chatId)) {
            shouldDelete = true;
        }
    }
    
    // Check forwarded messages
    if (msg.forward_from || msg.forward_from_chat) {
        const forwardHash = `forward_${msg.forward_from?.id || msg.forward_from_chat?.id}`;
        if (checkDuplicateMessage(userId, forwardHash, chatId)) {
            shouldDelete = true;
        }
    }
    
    // Delete message if violation detected
    if (shouldDelete) {
        bot.deleteMessage(chatId, messageId).catch(console.error);
        addViolation(userId, chatId);
    }
});

// Handle new members
bot.on('new_chat_members', async (msg) => {
    const chatId = msg.chat.id;
    const newMembers = msg.new_chat_members;
    
    // Check if bot was added
    const botAdded = newMembers.some(member => member.id === bot.getMe().then(me => me.id));
    
    if (botAdded) {
        if (!botData.allowedGroups.has(chatId.toString())) {
            await bot.sendMessage(chatId, MESSAGES.unauthorized.text, { parse_mode: MESSAGES.unauthorized.parse_mode });
            setTimeout(() => {
                bot.leaveChat(chatId).catch(console.error);
            }, 10000);
            return;
        }
        
        // Check bot permissions
        try {
            const botMember = await bot.getChatMember(chatId, (await bot.getMe()).id);
            
            if (botMember.status === 'administrator' && 
                botMember.can_delete_messages && 
                botMember.can_restrict_members) {
                
                await bot.sendMessage(chatId, MESSAGES.maxProtection.text, { 
                    parse_mode: MESSAGES.maxProtection.parse_mode 
                });
            } else {
                await bot.sendMessage(chatId, MESSAGES.needAdmin.text, { 
                    parse_mode: MESSAGES.needAdmin.parse_mode 
                });
            }
        } catch (error) {
            await bot.sendMessage(chatId, MESSAGES.welcome.text, { 
                parse_mode: MESSAGES.welcome.parse_mode 
            });
        }
    }
});

// Callback Query Handler
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const chatId = message.chat.id;
    
    // Check if user is admin
    if (!isAdmin(userId)) {
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Akses ditolak!', show_alert: true });
        return;
    }
    
    try {
        switch (data) {
            case 'manage_admins':
                await bot.editMessageText(
                    '👥 <b>KELOLA ADMIN</b>\n\n<i>Pilih opsi pengelolaan admin</i>',
                    {
                        chat_id: chatId,
                        message_id: message.message_id,
                        parse_mode: 'HTML',
                        ...ADMIN_MANAGE_KEYBOARD
                    }
                );
                break;
                
            case 'manage_groups':
                await bot.editMessageText(
                    '🏢 <b>KELOLA GRUP</b>\n\n<i>Pilih opsi pengelolaan grup</i>',
                    {
                        chat_id: chatId,
                        message_id: message.message_id,
                        parse_mode: 'HTML',
                        ...GROUP_MANAGE_KEYBOARD
                    }
                );
                break;
                
            case 'toggle_detection':
                botData.detectionEnabled = !botData.detectionEnabled;
                const detectionStatus = botData.detectionEnabled ? '🟢 AKTIF' : '🔴 NONAKTIF';
                await bot.editMessageText(
                    `🛡️ <b>STATUS DETEKSI</b>\n\n<b>Status:</b> <code>${detectionStatus}</code>\n\n<i>Sistem deteksi telah diperbarui</i>`,
                    {
                        chat_id: chatId,
                        message_id: message.message_id,
                        parse_mode: 'HTML',
                        ...ADMIN_KEYBOARD
                    }
                );
                break;
                
            case 'toggle_lockdown':
                botData.lockdownMode = !botData.lockdownMode;
                const lockdownStatus = botData.lockdownMode ? '🔒 AKTIF' : '🔓 NONAKTIF';
                
                // Apply lockdown to all groups
                if (botData.lockdownMode) {
                    for (const groupId of botData.allowedGroups) {
                        try {
                            await bot.setChatPermissions(groupId, {
                                can_send_messages: false,
                                can_send_media_messages: false,
                                can_send_polls: false,
                                can_send_other_messages: false,
                                can_add_web_page_previews: false,
                                can_change_info: false,
                                can_invite_users: false,
                                can_pin_messages: false
                            });
                        } catch (error) {
                            console.error(`Failed to lockdown group ${groupId}:`, error);
                        }
                    }
                } else {
                    for (const groupId of botData.allowedGroups) {
                        try {
                            await bot.setChatPermissions(groupId, {
                                can_send_messages: true,
                                can_send_media_messages: true,
                                can_send_polls: true,
                                can_send_other_messages: true,
                                can_add_web_page_previews: true,
                                can_change_info: false,
                                can_invite_users: true,
                                can_pin_messages: false
                            });
                        } catch (error) {
                            console.error(`Failed to unlock group ${groupId}:`, error);
                        }
                    }
                }
                
                await bot.editMessageText(
                    `🔒 <b>MODE LOCKDOWN</b>\n\n<b>Status:</b> <code>${lockdownStatus}</code>\n\n<i>Semua grup telah ${botData.lockdownMode ? 'dikunci' : 'dibuka'}</i>`,
                    {
                        chat_id: chatId,
                        message_id: message.message_id,
                        parse_mode: 'HTML',
                        ...ADMIN_KEYBOARD
                    }
                );
                break;
                
            case 'stats':
                const stats = `📊 <b>STATISTIK BOT</b>
                
🏢 <b>Total Grup:</b> <code>${botData.allowedGroups.size}</code>
👥 <b>Total Admin:</b> <code>${botData.admins.length}</code>
🚫 <b>User Terbanned:</b> <code>${botData.bannedUsers.size}</code>
🛡️ <b>Deteksi:</b> <code>${botData.detectionEnabled ? 'AKTIF' : 'NONAKTIF'}</code>
🔒 <b>Lockdown:</b> <code>${botData.lockdownMode ? 'AKTIF' : 'NONAKTIF'}</code>

📈 <b>Data Tersimpan:</b>
• Message Hashes: <code>${botData.messageHashes.size}</code>
• User Messages: <code>${botData.userMessages.size}</code>
• Violations: <code>${botData.userViolations.size}</code>`;
                
                await bot.editMessageText(stats, {
                    chat_id: chatId,
                    message_id: message.message_id,
                    parse_mode: 'HTML',
                    ...ADMIN_KEYBOARD
                });
                break;
                
            case 'cleanup':
                // Clean expired data
                const now = Date.now();
                
                // Clean banned users
                for (const [key, banUntil] of botData.bannedUsers.entries()) {
                    if (now > banUntil) {
                        botData.bannedUsers.delete(key);
                    }
                }
                
                // Clean old message hashes
                for (const [key, hashes] of botData.messageHashes.entries()) {
                    const recentHashes = hashes.filter(item => now - item.timestamp < 300000);
                    if (recentHashes.length === 0) {
                        botData.messageHashes.delete(key);
                    } else {
                        botData.messageHashes.set(key, recentHashes);
                    }
                }
                
                // Clean old user messages
                for (const [userId, messages] of botData.userMessages.entries()) {
                    const recentMessages = messages.filter(time => now - time < 60000);
                    if (recentMessages.length === 0) {
                        botData.userMessages.delete(userId);
                    } else {
                        botData.userMessages.set(userId, recentMessages);
                    }
                }
                
                await bot.editMessageText(
                    '🧹 <b>PEMBERSIHAN DATA</b>\n\n✅ <i>Data lama telah dibersihkan</i>\n\n<code>Sistem optimized!</code>',
                    {
                        chat_id: chatId,
                        message_id: message.message_id,
                        parse_mode: 'HTML',
                        ...ADMIN_KEYBOARD
                    }
                );
                break;
                
            case 'add_admin':
                await bot.editMessageText(
                    '➕ <b>TAMBAH ADMIN</b>\n\n<i>Silakan reply pesan ini dengan User ID admin yang akan ditambahkan</i>\n\n<code>Format: 123456789</code>',
                    {
                        chat_id: chatId,
                        message_id: message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'manage_admins' }]]
                        }
                    }
                );
                break;
                
            case 'remove_admin':
                if (!isMainAdmin(userId)) {
                    bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Hanya main admin yang dapat menghapus admin!', show_alert: true });
                    return;
                }
                
                const adminList = botData.admins.filter(id => id !== MAIN_ADMIN).map((id, index) => 
                    `${index + 1}. <code>${id}</code>`
                ).join('\n');
                
                await bot.editMessageText(
                    `➖ <b>HAPUS ADMIN</b>\n\n<b>Admin List:</b>\n${adminList || '<i>Tidak ada admin selain main admin</i>'}\n\n<i>Reply dengan User ID yang akan dihapus</i>`,
                    {
                        chat_id: chatId,
                        message_id: message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'manage_admins' }]]
                        }
                    }
                );
                break;
                
            case 'list_admins':
                const allAdmins = botData.admins.map((id, index) => 
                    `${index + 1}. <code>${id}</code> ${id === MAIN_ADMIN ? '👑' : '👤'}`
                ).join('\n');
                
                await bot.editMessageText(
                    `📋 <b>DAFTAR ADMIN</b>\n\n${allAdmins}\n\n<i>Total: ${botData.admins.length} admin</i>`,
                    {
                        chat_id: chatId,
                        message_id: message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'manage_admins' }]]
                        }
                    }
                );
                break;
                
            case 'add_group':
                await bot.editMessageText(
                    '➕ <b>TAMBAH GRUP</b>\n\n<i>Silakan reply pesan ini dengan Chat ID grup yang akan ditambahkan</i>\n\n<code>Format: -1001234567890</code>\n\n💡 <i>Tip: Dapatkan Chat ID dengan menambahkan bot ke grup dan ketik /id</i>',
                    {
                        chat_id: chatId,
                        message_id: message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'manage_groups' }]]
                        }
                    }
                );
                break;
                
            case 'remove_group':
                const groupList = Array.from(botData.allowedGroups).map((id, index) => 
                    `${index + 1}. <code>${id}</code>`
                ).join('\n');
                
                await bot.editMessageText(
                    `➖ <b>HAPUS GRUP</b>\n\n<b>Grup List:</b>\n${groupList || '<i>Tidak ada grup terdaftar</i>'}\n\n<i>Reply dengan Chat ID yang akan dihapus</i>`,
                    {
                        chat_id: chatId,
                        message_id: message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'manage_groups' }]]
                        }
                    }
                );
                break;
                
            case 'list_groups':
                const allGroups = Array.from(botData.allowedGroups);
                let groupInfo = '';
                
                if (allGroups.length === 0) {
                    groupInfo = '<i>Tidak ada grup terdaftar</i>';
                } else {
                    for (let i = 0; i < allGroups.length; i++) {
                        try {
                            const chat = await bot.getChat(allGroups[i]);
                            groupInfo += `${i + 1}. <b>${chat.title}</b>\n   <code>${allGroups[i]}</code>\n\n`;
                        } catch (error) {
                            groupInfo += `${i + 1}. <i>Unknown Group</i>\n   <code>${allGroups[i]}</code>\n\n`;
                        }
                    }
                }
                
                await bot.editMessageText(
                    `📋 <b>DAFTAR GRUP</b>\n\n${groupInfo}<i>Total: ${allGroups.length} grup</i>`,
                    {
                        chat_id: chatId,
                        message_id: message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'manage_groups' }]]
                        }
                    }
                );
                break;
                
            case 'back_main':
                await bot.editMessageText(
                    '🛡️ <b>SECURITY BOT PREMIUM</b>\n\n<i>Pilih menu yang ingin Anda akses</i>',
                    {
                        chat_id: chatId,
                        message_id: message.message_id,
                        parse_mode: 'HTML',
                        ...ADMIN_KEYBOARD
                    }
                );
                break;
                
            case 'close_menu':
                await bot.deleteMessage(chatId, message.message_id);
                break;
                
            default:
                bot.answerCallbackQuery(callbackQuery.id, { text: '❓ Perintah tidak dikenali', show_alert: true });
        }
        
        bot.answerCallbackQuery(callbackQuery.id);
        
    } catch (error) {
        console.error('Callback query error:', error);
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Terjadi kesalahan!', show_alert: true });
    }
});

// Handle replies for admin/group management
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Skip if not admin or not a reply
    if (!isAdmin(userId) || !msg.reply_to_message) return;
    
    const replyText = msg.reply_to_message.text;
    
    // Handle add admin
    if (replyText && replyText.includes('TAMBAH ADMIN')) {
        const newAdminId = parseInt(text.trim());
        
        if (isNaN(newAdminId)) {
            bot.sendMessage(chatId, '❌ <b>Format salah!</b>\n\n<i>Gunakan format: 123456789</i>', { parse_mode: 'HTML' });
            return;
        }
        
        if (botData.admins.includes(newAdminId)) {
            bot.sendMessage(chatId, '⚠️ <b>User sudah menjadi admin!</b>', { parse_mode: 'HTML' });
            return;
        }
        
        botData.admins.push(newAdminId);
        bot.sendMessage(chatId, `✅ <b>Admin berhasil ditambahkan!</b>\n\n<b>User ID:</b> <code>${newAdminId}</code>`, { parse_mode: 'HTML' });
    }
    
    // Handle remove admin
    else if (replyText && replyText.includes('HAPUS ADMIN')) {
        if (!isMainAdmin(userId)) {
            bot.sendMessage(chatId, '❌ <b>Akses ditolak!</b>\n\n<i>Hanya main admin yang dapat menghapus admin</i>', { parse_mode: 'HTML' });
            return;
        }
        
        const removeAdminId = parseInt(text.trim());
        
        if (isNaN(removeAdminId)) {
            bot.sendMessage(chatId, '❌ <b>Format salah!</b>\n\n<i>Gunakan format: 123456789</i>', { parse_mode: 'HTML' });
            return;
        }
        
        if (removeAdminId === MAIN_ADMIN) {
            bot.sendMessage(chatId, '❌ <b>Tidak dapat menghapus main admin!</b>', { parse_mode: 'HTML' });
            return;
        }
        
        const adminIndex = botData.admins.indexOf(removeAdminId);
        if (adminIndex === -1) {
            bot.sendMessage(chatId, '⚠️ <b>User bukan admin!</b>', { parse_mode: 'HTML' });
            return;
        }
        
        botData.admins.splice(adminIndex, 1);
        bot.sendMessage(chatId, `✅ <b>Admin berhasil dihapus!</b>\n\n<b>User ID:</b> <code>${removeAdminId}</code>`, { parse_mode: 'HTML' });
    }
    
    // Handle add group
    else if (replyText && replyText.includes('TAMBAH GRUP')) {
        const newGroupId = text.trim();
        
        if (!newGroupId.startsWith('-') || isNaN(parseInt(newGroupId))) {
            bot.sendMessage(chatId, '❌ <b>Format salah!</b>\n\n<i>Gunakan format grup ID: -1001234567890</i>', { parse_mode: 'HTML' });
            return;
        }
        
        if (botData.allowedGroups.has(newGroupId)) {
            bot.sendMessage(chatId, '⚠️ <b>Grup sudah terdaftar!</b>', { parse_mode: 'HTML' });
            return;
        }
        
        botData.allowedGroups.add(newGroupId);
        bot.sendMessage(chatId, `✅ <b>Grup berhasil ditambahkan!</b>\n\n<b>Chat ID:</b> <code>${newGroupId}</code>`, { parse_mode: 'HTML' });
    }
    
    // Handle remove group
    else if (replyText && replyText.includes('HAPUS GRUP')) {
        const removeGroupId = text.trim();
        
        if (!botData.allowedGroups.has(removeGroupId)) {
            bot.sendMessage(chatId, '⚠️ <b>Grup tidak terdaftar!</b>', { parse_mode: 'HTML' });
            return;
        }
        
        botData.allowedGroups.delete(removeGroupId);
        
        // Leave the group
        bot.leaveChat(removeGroupId).catch(console.error);
        
        bot.sendMessage(chatId, `✅ <b>Grup berhasil dihapus!</b>\n\n<b>Chat ID:</b> <code>${removeGroupId}</code>\n\n<i>Bot telah keluar dari grup</i>`, { parse_mode: 'HTML' });
    }
});

// Command to get chat ID
bot.onText(/\/id/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        if (isAdmin(userId)) {
            bot.sendMessage(chatId, `📋 <b>INFORMASI CHAT</b>\n\n<b>Chat ID:</b> <code>${chatId}</code>\n<b>Your ID:</b> <code>${userId}</code>\n<b>Chat Type:</b> <code>${msg.chat.type}</code>`, { parse_mode: 'HTML' });
        }
    } else {
        bot.sendMessage(chatId, `👤 <b>YOUR USER ID</b>\n\n<code>${userId}</code>`, { parse_mode: 'HTML' });
    }
});

// Auto-save data periodically
setInterval(() => {
    try {
        const dataToSave = {
            admins: botData.admins,
            allowedGroups: Array.from(botData.allowedGroups),
            detectionEnabled: botData.detectionEnabled,
            lockdownMode: botData.lockdownMode
        };
        
        fs.writeFileSync('bot_data.json', JSON.stringify(dataToSave, null, 2));
        console.log('✅ Data saved successfully');
    } catch (error) {
        console.error('❌ Failed to save data:', error);
    }
}, 60000); // Save every minute

// Load data on startup
function loadData() {
    try {
        if (fs.existsSync('bot_data.json')) {
            const savedData = JSON.parse(fs.readFileSync('bot_data.json', 'utf8'));
            
            botData.admins = savedData.admins || [MAIN_ADMIN];
            botData.allowedGroups = new Set(savedData.allowedGroups || []);
            botData.detectionEnabled = savedData.detectionEnabled !== undefined ? savedData.detectionEnabled : true;
            botData.lockdownMode = savedData.lockdownMode || false;
            
            console.log('✅ Data loaded successfully');
            console.log(`📊 Loaded ${botData.admins.length} admins and ${botData.allowedGroups.size} groups`);
        }
    } catch (error) {
        console.error('❌ Failed to load data:', error);
        console.log('🔄 Using default configuration');
    }
}

// Cleanup function for expired data
function cleanupExpiredData() {
    const now = Date.now();
    let cleaned = 0;
    
    // Clean banned users
    for (const [key, banUntil] of botData.bannedUsers.entries()) {
        if (now > banUntil) {
            botData.bannedUsers.delete(key);
            cleaned++;
        }
    }
    
    // Clean old message hashes
    for (const [key, hashes] of botData.messageHashes.entries()) {
        const recentHashes = hashes.filter(item => now - item.timestamp < 300000);
        if (recentHashes.length === 0) {
            botData.messageHashes.delete(key);
            cleaned++;
        } else if (recentHashes.length < hashes.length) {
            botData.messageHashes.set(key, recentHashes);
        }
    }
    
    // Clean old user messages
    for (const [userId, messages] of botData.userMessages.entries()) {
        const recentMessages = messages.filter(time => now - time < 60000);
        if (recentMessages.length === 0) {
            botData.userMessages.delete(userId);
            cleaned++;
        } else if (recentMessages.length < messages.length) {
            botData.userMessages.set(userId, recentMessages);
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} expired data entries`);
    }
}

// Auto cleanup every 5 minutes
setInterval(cleanupExpiredData, 300000);

// Watchdog auto-recovery
function watchdogCheck() {
    try {
        // Check if bot is responsive
        bot.getMe().then(() => {
            console.log('💚 Bot is healthy');
        }).catch((error) => {
            console.error('❤️‍🩹 Bot health check failed:', error);
            // Attempt to restart polling
            setTimeout(() => {
                try {
                    bot.stopPolling();
                    setTimeout(() => {
                        bot.startPolling();
                        console.log('🔄 Bot polling restarted');
                    }, 5000);
                } catch (restartError) {
                    console.error('💀 Failed to restart bot:', restartError);
                }
            }, 1000);
        });
    } catch (error) {
        console.error('🚨 Watchdog error:', error);
    }
}

// Run watchdog every 2 minutes
setInterval(watchdogCheck, 120000);

// Error handling
bot.on('error', (error) => {
    console.error('🚨 Bot error:', error);
});

bot.on('polling_error', (error) => {
    console.error('📡 Polling error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Shutting down bot...');
    
    // Save data before exit
    try {
        const dataToSave = {
            admins: botData.admins,
            allowedGroups: Array.from(botData.allowedGroups),
            detectionEnabled: botData.detectionEnabled,
            lockdownMode: botData.lockdownMode
        };
        
        fs.writeFileSync('bot_data.json', JSON.stringify(dataToSave, null, 2));
        console.log('💾 Final data save completed');
    } catch (error) {
        console.error('❌ Failed to save data on exit:', error);
    }
    
    bot.stopPolling();
    process.exit(0);
});

// Initialize bot
console.log('🚀 Starting Premium Security Bot...');
loadData();

// Send startup notification to main admin
bot.sendMessage(MAIN_ADMIN, 
    `🚀 <b>BOT STARTED SUCCESSFULLY</b>

⚡ <b>Status:</b> <code>ONLINE</code>
🛡️ <b>Security Level:</b> <code>PREMIUM</code>
📊 <b>Configuration:</b>
• Admins: <code>${botData.admins.length}</code>
• Groups: <code>${botData.allowedGroups.size}</code>
• Detection: <code>${botData.detectionEnabled ? 'ON' : 'OFF'}</code>

<i>Bot siap melindungi grup Anda 24/7!</i>`, 
    { parse_mode: 'HTML' }
).catch(() => {
    console.log('⚠️ Could not send startup notification to main admin');
});

console.log('✅ Premium Security Bot is now running!');
console.log(`👑 Main Admin: ${MAIN_ADMIN}`);
console.log(`👥 Total Admins: ${botData.admins.length}`);
console.log(`🏢 Allowed Groups: ${botData.allowedGroups.size}`);
console.log(`🛡️ Detection: ${botData.detectionEnabled ? 'ENABLED' : 'DISABLED'}`);
console.log('📡 Bot is ready to receive messages...');

// Additional Security Features

// Advanced spam detection using AI-like pattern matching
function advancedSpamDetection(text, userId, chatId) {
    if (!text) return false;
    
    // Check for excessive repetition
    const words = text.toLowerCase().split(/\s+/);
    const wordCount = {};
    
    words.forEach(word => {
        wordCount[word] = (wordCount[word] || 0) + 1;
    });
    
    // If any word appears more than 50% of the message, it's likely spam
    const maxWordFreq = Math.max(...Object.values(wordCount));
    if (maxWordFreq > words.length * 0.5 && words.length > 3) {
        return true;
    }
    
    // Check for URL spam
    const urlPattern = /(https?:\/\/[^\s]+)/gi;
    const urls = text.match(urlPattern) || [];
    if (urls.length > 3) return true;
    
    // Check for excessive emoji/special characters
    const specialChars = text.match(/[^\w\s]/g) || [];
    if (specialChars.length > text.length * 0.7) return true;
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
        /(.)\1{10,}/g, // Same character repeated 10+ times
        /[A-Z]{20,}/g, // All caps words longer than 20 chars
        /\d{10,}/g,    // Long number sequences
        /@\w+/g       // Multiple mentions
    ];
    
    return suspiciousPatterns.some(pattern => {
        const matches = text.match(pattern);
        return matches && matches.length > 2;
    });
}

// Enhanced message processing with the new detection
const originalMessageHandler = bot.listeners('message')[0];
bot.removeAllListeners('message');

bot.on('message', async (msg) => {
    // Run advanced spam detection first
    if (msg.text && advancedSpamDetection(msg.text, msg.from.id, msg.chat.id)) {
        if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
            if (botData.allowedGroups.has(msg.chat.id.toString()) && !isAdmin(msg.from.id)) {
                bot.deleteMessage(msg.chat.id, msg.message_id).catch(console.error);
                addViolation(msg.from.id, msg.chat.id);
                return;
            }
        }
    }
    
    // Continue with original handler
    originalMessageHandler.call(bot, msg);
});

module.exports = { bot, botData, isAdmin, isMainAdmin };
