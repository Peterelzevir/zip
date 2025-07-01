//
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const crypto = require('crypto');

// Konfigurasi Bot
const BOT_TOKEN = '7566921062:AAHJ4ij3ObZA9Rl8lfrhuZ5KTZaY82gKeHA';
const MAIN_ADMIN = 5988451717; // ID Telegram admin utama (ganti dengan ID Anda)

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Database dalam memory (gunakan database nyata untuk production)
let botData = {
    admins: [MAIN_ADMIN],
    groups: new Map(),
    allowedGroups: new Set(),
    userViolations: new Map(),
    messageHistory: new Map(),
    bannedUsers: new Map(),
    detectionEnabled: true,
    lockdownMode: false
};

// Pattern deteksi bahasa Indonesia yang berbahaya
const dangerousPatterns = [
    // Investasi bodong
    /\b(investasi|profit|keuntungan|modal|trading|forex|crypto|bitcoin|mining|mlm|bisnis)\s*(mudah|cepat|instant|pasti|untung|profit|200%|500%|1000%)\b/gi,
    /\b(daftar\s*sekarang|join\s*now|klik\s*link|deposit\s*minimal|withdraw|bonus|passive\s*income|financial\s*freedom)\b/gi,
    /(wa\.me|t\.me|bit\.ly|tinyurl|shorturl)\/(.*)(invest|profit|forex|crypto|trading|mlm)/gi,
    
    // SARA dan ujaran kebencian
    /\b(kafir|ateis|kristen\s*anjing|muslim\s*teroris|cina\s*pelit|pribumi\s*malas|babi\s*ngepet|anjing\s*lu|kontol|memek|pepek|ngewe|ngentot|puki|taek|bajingan|bangsat|brengsek|sialan|tolol|goblok|idiot|bodoh\s*banget)\b/gi,
    /\b(pembunuhan|bunuh|mati\s*aja|mati\s*lu|suicide|bunuh\s*diri|gantung\s*diri|loncat\s*dari)\b/gi,
    
    // Konten dewasa
    /\b(bokep|porn|sex|nude|telanjang|bugil|onlyfans|cam\s*girl|escort|pelacur|wts|ayam\s*kampus)\b/gi,
    /\b(janda\s*kaya|tante\s*girang|mama\s*muda|sugar\s*daddy|sugar\s*mommy|one\s*night\s*stand)\b/gi,
    
    // Spam dan promosi
    /\b(promo|diskon|gratis|free|sale|jual|beli|dropship|reseller|agen|distributor)\s*(hubungi|wa|whatsapp|contact|dm)\b/gi,
    /(085|087|089|081|082|083|084|088|+628)\d{8,10}/g,
    
    // Kata kasar umum
    /\b(anjing|babi|monyet|kampret|bangke|setan|iblis|laknat|terkutuk|brengsek|keparat|asu|jancuk|cok|tai|shit|fuck|damn|hell|bitch|asshole)\b/gi,
    
    // Hoax dan misinformasi
    /\b(hoax|bohong|palsu|fake\s*news|konspirasi|illuminati|covid\s*palsu|vaksin\s*berbahaya|bumi\s*datar)\b/gi,
    
    // Link mencurigakan
    /(bit\.ly|tinyurl|short\.link|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly)\/\w+/gi,
    
    // Narkoba dan illegal
    /\b(sabu|ganja|marijuana|heroin|kokain|ekstasi|pil\s*koplo|tramadol|narkoba|drugs|weed|meth)\b/gi,
    
    // Judi online
    /\b(judi|slot|casino|poker|bandar|taruhan|betting|odds|jackpot|situs\s*judi|agen\s*bola)\b/gi,
    
    // Kekerasan
    /\b(pukul|tampar|tendang|siksa|aniaya|kekerasan|sadis|brutal|tortur|penculikan|pembunuhan)\b/gi
];

// Rate limiting
const rateLimiter = new Map();
const RATE_LIMIT = 5; // maksimal 5 pesan per menit
const RATE_WINDOW = 60000; // 1 menit

// Hash gambar untuk deteksi duplikat
const imageHashes = new Map();

// Fungsi utilitas
function generateHash(text) {
    return crypto.createHash('md5').update(text).digest('hex');
}

function isRateLimited(userId) {
    const now = Date.now();
    const userRate = rateLimiter.get(userId) || { count: 0, window: now, messages: [] };
    
    // Bersihkan pesan lama dari window
    userRate.messages = userRate.messages.filter(timestamp => now - timestamp < RATE_WINDOW);
    
    // Tambah pesan baru
    userRate.messages.push(now);
    userRate.count = userRate.messages.length;
    
    // Update data
    rateLimiter.set(userId, userRate);
    
    // Return true jika melebihi limit (akan dihapus pesannya)
    return userRate.count > RATE_LIMIT;
}

function detectDangerousContent(text) {
    for (const pattern of dangerousPatterns) {
        if (pattern.test(text)) {
            return true;
        }
    }
    return false;
}

function isDuplicateMessage(userId, groupId, messageText) {
    const key = `${userId}_${groupId}`;
    const userHistory = botData.messageHistory.get(key) || [];
    const messageHash = generateHash(messageText.toLowerCase().trim()); // Normalize text
    
    // Cek duplikasi dalam 2 menit terakhir (waktu bersamaan)
    const now = Date.now();
    const recentWindow = 120000; // 2 menit
    const recentMessages = userHistory.filter(msg => now - msg.timestamp < recentWindow);
    
    // Cek apakah ada pesan dengan hash yang sama dalam waktu dekat
    const isDuplicate = recentMessages.some(msg => msg.hash === messageHash);
    
    // Update history - simpan pesan baru
    const newEntry = { hash: messageHash, timestamp: now, text: messageText.substring(0, 50) };
    const updatedHistory = [...recentMessages, newEntry].slice(-20); // simpan 20 pesan terakhir
    botData.messageHistory.set(key, updatedHistory);
    
    return isDuplicate;
}

function isUserBanned(userId, groupId) {
    const key = `${userId}_${groupId}`;
    const banInfo = botData.bannedUsers.get(key);
    if (!banInfo) return false;
    
    const now = Date.now();
    if (now > banInfo.until) {
        botData.bannedUsers.delete(key);
        return false;
    }
    return true;
}

function banUser(userId, groupId, duration = 86400000) { // 24 jam default
    const key = `${userId}_${groupId}`;
    const until = Date.now() + duration;
    botData.bannedUsers.set(key, { until, violations: (botData.bannedUsers.get(key)?.violations || 0) + 1 });
}

function addViolation(userId, groupId) {
    const key = `${userId}_${groupId}`;
    const violations = botData.userViolations.get(key) || 0;
    botData.userViolations.set(key, violations + 1);
    return violations + 1;
}

// Inline keyboard untuk admin
function getAdminKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '👥 Kelola Admin', callback_data: 'manage_admins' },
                    { text: '🏢 Kelola Grup', callback_data: 'manage_groups' }
                ],
                [
                    { text: '🛡️ Pengaturan Deteksi', callback_data: 'detection_settings' },
                    { text: '📊 Statistik', callback_data: 'statistics' }
                ],
                [
                    { text: '🚨 Mode Lockdown', callback_data: 'toggle_lockdown' },
                    { text: '🧹 Bersihkan Data', callback_data: 'cleanup_data' }
                ],
                [
                    { text: '📋 Bantuan', callback_data: 'help' }
                ]
            ]
        }
    };
}

function getAdminManagementKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '➕ Tambah Admin', callback_data: 'add_admin' },
                    { text: '➖ Hapus Admin', callback_data: 'remove_admin' }
                ],
                [
                    { text: '📋 List Admin', callback_data: 'list_admins' },
                    { text: '🔙 Kembali', callback_data: 'main_menu' }
                ]
            ]
        }
    };
}

function getGroupManagementKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '➕ Tambah Grup', callback_data: 'add_group' },
                    { text: '➖ Hapus Grup', callback_data: 'remove_group' }
                ],
                [
                    { text: '📋 List Grup', callback_data: 'list_groups' },
                    { text: '🔙 Kembali', callback_data: 'main_menu' }
                ]
            ]
        }
    };
}

// Handler untuk callback query
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    // Cek izin admin
    if (!botData.admins.includes(userId)) {
        return bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Akses ditolak! Anda bukan admin bot.',
            show_alert: true
        });
    }

    try {
        switch (data) {
            case 'main_menu':
                await bot.editMessageText('🤖 **Bot Security Premium Dashboard**\n\nPilih menu yang ingin Anda akses:', {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    ...getAdminKeyboard()
                });
                break;

            case 'manage_admins':
                const adminList = botData.admins.map((id, index) => 
                    `${index + 1}. ${id} ${id === MAIN_ADMIN ? '👑 (Main Admin)' : ''}`
                ).join('\n');
                
                await bot.editMessageText(`👥 **Manajemen Admin**\n\n📋 **Daftar Admin:**\n${adminList}\n\n💡 *Main Admin tidak dapat dihapus*`, {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    ...getAdminManagementKeyboard()
                });
                break;

            case 'manage_groups':
                const groupList = Array.from(botData.allowedGroups).map((groupId, index) => {
                    const groupInfo = botData.groups.get(groupId);
                    return `${index + 1}. ${groupInfo?.title || 'Unknown'} (${groupId})`;
                }).join('\n') || 'Belum ada grup terdaftar';
                
                await bot.editMessageText(`🏢 **Manajemen Grup**\n\n📋 **Grup Terdaftar:**\n${groupList}`, {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    ...getGroupManagementKeyboard()
                });
                break;

            case 'detection_settings':
                const status = botData.detectionEnabled ? '🟢 AKTIF' : '🔴 NONAKTIF';
                await bot.editMessageText(`🛡️ **Pengaturan Deteksi**\n\nStatus Deteksi: ${status}\n\n🔍 **Fitur Aktif:**\n✅ Deteksi Pattern Bahaya\n✅ Rate Limiting\n✅ Filter Duplikat\n✅ Analisis Forward\n✅ Hash Verification\n✅ Auto Recovery`, {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: botData.detectionEnabled ? '🔴 Nonaktifkan' : '🟢 Aktifkan', callback_data: 'toggle_detection' }
                            ],
                            [
                                { text: '🔙 Kembali', callback_data: 'main_menu' }
                            ]
                        ]
                    }
                });
                break;

            case 'toggle_detection':
                botData.detectionEnabled = !botData.detectionEnabled;
                const newStatus = botData.detectionEnabled ? '🟢 DIAKTIFKAN' : '🔴 DINONAKTIFKAN';
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: `Deteksi keamanan ${newStatus}`,
                    show_alert: true
                });
                // Refresh halaman
                bot.emit('callback_query', { ...callbackQuery, data: 'detection_settings' });
                break;

            case 'toggle_lockdown':
                botData.lockdownMode = !botData.lockdownMode;
                const lockdownStatus = botData.lockdownMode ? '🔒 DIAKTIFKAN' : '🔓 DINONAKTIFKAN';
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: `Mode Lockdown ${lockdownStatus}`,
                    show_alert: true
                });
                break;

            case 'statistics':
                const stats = {
                    groups: botData.allowedGroups.size,
                    admins: botData.admins.length,
                    bannedUsers: botData.bannedUsers.size,
                    violations: Array.from(botData.userViolations.values()).reduce((a, b) => a + b, 0)
                };
                
                await bot.editMessageText(`📊 **Statistik Bot**\n\n🏢 Grup Terdaftar: ${stats.groups}\n👥 Admin: ${stats.admins}\n🚫 User Ter-ban: ${stats.bannedUsers}\n⚠️ Total Pelanggaran: ${stats.violations}\n\n🛡️ Status: ${botData.detectionEnabled ? '🟢 Aktif' : '🔴 Nonaktif'}\n🚨 Lockdown: ${botData.lockdownMode ? '🔒 Aktif' : '🔓 Nonaktif'}`, {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'main_menu' }]]
                    }
                });
                break;

            case 'cleanup_data':
                // Bersihkan data lama
                const now = Date.now();
                let cleaned = 0;
                
                // Hapus ban yang sudah expired
                for (const [key, banInfo] of botData.bannedUsers.entries()) {
                    if (now > banInfo.until) {
                        botData.bannedUsers.delete(key);
                        cleaned++;
                    }
                }
                
                // Hapus history pesan lama
                for (const [key, messages] of botData.messageHistory.entries()) {
                    const recent = messages.filter(msg => now - msg.timestamp < 86400000); // 24 jam
                    if (recent.length !== messages.length) {
                        botData.messageHistory.set(key, recent);
                        cleaned++;
                    }
                }
                
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: `✅ Berhasil membersihkan ${cleaned} data lama`,
                    show_alert: true
                });
                break;

            case 'help':
                await bot.editMessageText(`📋 **Bantuan Bot Security Premium**\n\n🤖 **Fitur Utama:**\n• Deteksi konten berbahaya otomatis\n• Rate limiting untuk spam\n• Filter pesan duplikat\n• Manajemen admin dan grup\n• Mode lockdown darurat\n\n⚡ **Cara Kerja:**\n• Bot akan otomatis menghapus pesan yang melanggar\n• Setelah 5 pelanggaran, user akan di-ban 24 jam\n• Bot hanya bekerja di grup yang terdaftar\n• Memerlukan izin admin untuk bekerja optimal\n\n🛡️ **Pattern Deteksi:**\n• Investasi bodong & MLM\n• SARA & ujaran kebencian\n• Konten dewasa\n• Spam & promosi\n• Hoax & misinformasi\n• Narkoba & judi\n• Kekerasan\n\n📞 **Support:** Hubungi admin utama`, {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'main_menu' }]]
                    }
                });
                break;

            default:
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: '⚠️ Fitur belum tersedia',
                    show_alert: true
                });
        }
    } catch (error) {
        console.error('Callback query error:', error);
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Terjadi kesalahan sistem',
            show_alert: true
        });
    }
});

// Handler ketika bot ditambahkan ke grup
bot.on('new_chat_members', async (msg) => {
    const chatId = msg.chat.id;
    const newMembers = msg.new_chat_members;
    
    // Cek apakah bot yang ditambahkan
    const botAdded = newMembers.some(member => member.id === bot.options.id);
    
    if (botAdded) {
        // Cek apakah grup terdaftar
        if (!botData.allowedGroups.has(chatId)) {
            await bot.sendMessage(chatId, 
                `⚠️ **PERINGATAN KEAMANAN**\n\n❌ Grup ini belum terdaftar dalam sistem!\n\n🚨 Bot akan keluar dari grup dalam 10 detik.\n\n📞 **Untuk mendaftarkan grup:**\nHubungi admin bot untuk menambahkan grup ini ke whitelist.\n\n🔐 **Bot Security Premium**\n*Melindungi grup Anda 24/7*`, 
                { parse_mode: 'Markdown' }
            );
            
            setTimeout(async () => {
                await bot.leaveChat(chatId);
            }, 10000);
            return;
        }
        
        // Simpan info grup
        botData.groups.set(chatId, {
            title: msg.chat.title,
            type: msg.chat.type,
            addedAt: Date.now()
        });
        
        // Cek apakah bot memiliki izin admin
        try {
            const chatMember = await bot.getChatMember(chatId, bot.options.id);
            
            if (chatMember.status !== 'administrator') {
                await bot.sendMessage(chatId,
                    `🤖 **Bot Security Premium Aktif!**\n\n⚠️ **Perhatian Penting:**\nBot memerlukan izin administrator untuk bekerja dengan optimal.\n\n🛡️ **Izin yang diperlukan:**\n• Hapus pesan\n• Ban/unban anggota\n• Baca semua pesan\n\n📢 **Silakan jadikan bot sebagai admin dengan izin yang diperlukan.**`,
                    { parse_mode: 'Markdown' }
                );
            } else {
                await bot.sendMessage(chatId,
                    `✅ **Bot Security Premium Siap Beroperasi!**\n\n🛡️ **Sistem Keamanan Aktif:**\n• Deteksi konten berbahaya\n• Filter spam & duplikat\n• Rate limiting otomatis\n• Mode lockdown darurat\n\n🚀 **Bot siap melindungi grup Anda 24/7!**\n\n⚡ *Semua pelanggaran akan ditangani secara otomatis*`,
                    { parse_mode: 'Markdown' }
                );
            }
        } catch (error) {
            console.error('Error checking bot permissions:', error);
        }
    }
});

// Handler untuk semua pesan
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const messageId = msg.message_id;
    
    // Ignore pesan dari bot sendiri
    if (msg.from.is_bot) return;
    
    // Handler untuk private chat dengan admin
    if (msg.chat.type === 'private') {
        if (botData.admins.includes(userId)) {
            if (msg.text === '/start' || msg.text === '/menu') {
                await bot.sendMessage(chatId, '🤖 **Bot Security Premium Dashboard**\n\nSelamat datang, Admin! Pilih menu yang ingin Anda akses:', {
                    parse_mode: 'Markdown',
                    ...getAdminKeyboard()
                });
            }
        } else {
            await bot.sendMessage(chatId, '❌ Akses ditolak! Bot ini hanya untuk admin.');
        }
        return;
    }
    
    // Handler untuk grup
    if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        // Cek apakah grup terdaftar
        if (!botData.allowedGroups.has(chatId)) {
            return; // Ignore grup yang tidak terdaftar
        }
        
        // Cek apakah user di-ban
        if (isUserBanned(userId, chatId)) {
            try {
                await bot.deleteMessage(chatId, messageId);
            } catch (error) {
                console.error('Error deleting message from banned user:', error);
            }
            return;
        }
        
        // Skip pemeriksaan untuk admin
        if (botData.admins.includes(userId)) {
            return;
        }
        
        // Mode lockdown - hapus semua pesan kecuali admin
        if (botData.lockdownMode) {
            try {
                await bot.deleteMessage(chatId, messageId);
            } catch (error) {
                console.error('Error deleting message in lockdown:', error);
            }
            return;
        }
        
        // Skip jika deteksi nonaktif
        if (!botData.detectionEnabled) {
            return;
        }
        
        let shouldDelete = false;
        let violationType = '';
        
        // 1. RATE LIMITING CHECK - Hapus jika spam terlalu cepat
        if (isRateLimited(userId)) {
            shouldDelete = true;
            violationType = 'Rate Limiting - Spam Terlalu Cepat';
        }
        
        // 2. CEK KONTEN PESAN TEXT
        if (msg.text && !shouldDelete) {
            // Deteksi pesan duplikat dalam waktu bersamaan - HAPUS yang duplikat
            if (isDuplicateMessage(userId, chatId, msg.text)) {
                shouldDelete = true;
                violationType = 'Pesan Duplikat Terdeteksi';
            }
            
            // Deteksi konten berbahaya - HAPUS yang berbahaya
            if (!shouldDelete && detectDangerousContent(msg.text)) {
                shouldDelete = true;
                violationType = 'Konten Berbahaya Terdeteksi';
            }
        }
        
        // 3. CEK PESAN FORWARD - Baik forward maupun tidak, deteksi konten berbahaya
        if ((msg.forward_from || msg.forward_from_chat || msg.text) && !shouldDelete) {
            // Analisis SEMUA pesan (forward dan non-forward) untuk konten berbahaya
            if (msg.text && detectDangerousContent(msg.text)) {
                shouldDelete = true;
                if (msg.forward_from || msg.forward_from_chat) {
                    violationType = 'Forward Pesan Berbahaya';
                } else {
                    violationType = 'Pesan Berbahaya';
                }
            }
        }
        
        // 4. CEK FOTO/GAMBAR - Hash verification untuk deteksi duplikat
        if (msg.photo && !shouldDelete) {
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            const imageHash = generateHash(fileId);
            
            // Cek apakah hash gambar sudah ada (duplikat) - HAPUS yang duplikat
            if (imageHashes.has(imageHash)) {
                shouldDelete = true;
                violationType = 'Gambar Duplikat - Hash Sama';
            } else {
                // Simpan hash baru jika belum ada
                imageHashes.set(imageHash, Date.now());
            }
        }
        
        // 5. CEK KONTEN MEDIA LAINNYA (video, document, sticker, dll)
        if (!shouldDelete) {
            // Deteksi caption berbahaya pada media
            if (msg.caption && detectDangerousContent(msg.caption)) {
                shouldDelete = true;
                violationType = 'Caption Media Berbahaya';
            }
            
            // Rate limit untuk media juga
            if ((msg.video || msg.document || msg.sticker || msg.voice || msg.video_note) && isRateLimited(userId)) {
                shouldDelete = true;
                violationType = 'Spam Media Berlebihan';
            }
        }
        
        // Hapus pesan jika melanggar
        if (shouldDelete) {
            try {
                await bot.deleteMessage(chatId, messageId);
                console.log(`🗑️ DELETED MESSAGE - User: ${userId} | Group: ${chatId} | Reason: ${violationType} | Violations: ${violations}/5`);
                
                // Tambah pelanggaran
                const violations = addViolation(userId, chatId);
                
                // Ban user jika sudah 5 pelanggaran
                if (violations >= 5) {
                    banUser(userId, chatId);
                    
                    // Kirim notifikasi ban
                    try {
                        const banMessage = await bot.sendMessage(chatId, 
                            `🚫 **USER DIBANNED OTOMATIS**\n\n👤 **User:** ${msg.from.first_name} ${msg.from.last_name || ''}\n🆔 **ID:** ${userId}\n⏰ **Durasi:** 24 jam\n🔢 **Total Pelanggaran:** ${violations}\n📋 **Pelanggaran Terakhir:** ${violationType}\n\n⚠️ *User tidak dapat mengirim pesan selama masa ban*\n\n🤖 *Bot Security Premium - Auto Protection*`, 
                            { parse_mode: 'Markdown' }
                        );
                        
                        // Hapus notifikasi ban setelah 15 detik
                        setTimeout(async () => {
                            try {
                                await bot.deleteMessage(chatId, banMessage.message_id);
                            } catch (error) {
                                console.error('Error deleting ban notification:', error);
                            }
                        }, 15000);
                        
                        console.log(`🚫 USER BANNED - ${userId} in group ${chatId} for ${violations} violations`);
                        
                    } catch (error) {
                        console.error('Error sending ban notification:', error);
                    }
                } else {
                    // Log pelanggaran tanpa ban
                    console.log(`⚠️ VIOLATION RECORDED - User ${userId}: ${violations}/5 violations`);
                }
                
            } catch (error) {
                console.error('Error deleting message:', error);
                
                // Jika tidak bisa hapus pesan, mungkin bot tidak punya izin admin
                if (error.response && error.response.body.error_code === 400) {
                    try {
                        await bot.sendMessage(chatId,
                            `⚠️ **Bot Memerlukan Izin Admin**\n\nBot tidak dapat menghapus pesan karena tidak memiliki izin administrator yang cukup.\n\n🛡️ **Berikan izin berikut:**\n• Delete messages\n• Ban/unban users\n• Read all messages\n\n📢 *Jadikan bot sebagai admin untuk perlindungan maksimal*`,
                            { parse_mode: 'Markdown' }
                        );
                    } catch (notifyError) {
                        console.error('Error sending permission notification:', notifyError);
                    }
                }
            }
        }
    }
});

// Handler error
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

bot.on('error', (error) => {
    console.error('Bot error:', error);
});

// Watchdog untuk auto-recovery
setInterval(() => {
    try {
        // Cleanup expired bans
        const now = Date.now();
        for (const [key, banInfo] of botData.bannedUsers.entries()) {
            if (now > banInfo.until) {
                botData.bannedUsers.delete(key);
            }
        }
        
        // Cleanup old message history
        for (const [key, messages] of botData.messageHistory.entries()) {
            const recent = messages.filter(msg => now - msg.timestamp < 86400000);
            if (recent.length !== messages.length) {
                botData.messageHistory.set(key, recent);
            }
        }
        
        // Cleanup old image hashes
        for (const [hash, timestamp] of imageHashes.entries()) {
            if (now - timestamp > 86400000) { // 24 jam
                imageHashes.delete(hash);
            }
        }
        
        console.log('Watchdog cleanup completed');
    } catch (error) {
        console.error('Watchdog error:', error);
    }
}, 300000); // Setiap 5 menit

console.log('🤖 Bot Security Premium started successfully!');
console.log('🛡️ Fitur keamanan aktif:');
console.log('   ✅ Pattern Detection');
console.log('   ✅ Rate Limiting');
console.log('   ✅ Duplicate Filter');
console.log('   ✅ Forward Analysis');
console.log('   ✅ Image Hash Verification');
console.log('   ✅ Auto Recovery Watchdog');
console.log('   ✅ Emergency Lockdown');
console.log('   ✅ Auto Data Cleanup');
console.log('📊 Bot siap melindungi grup Anda!');
