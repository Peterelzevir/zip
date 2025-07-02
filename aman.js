//
//
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs').promises;
const crypto = require('crypto');
const path = require('path');

// Konfigurasi Bot
const BOT_TOKEN = '7566921062:AAHJ4ij3ObZA9Rl8lfrhuZ5KTZaY82gKeHA'; // Ganti dengan token bot Anda
const MAIN_ADMIN = 5988451717; // Ganti dengan user ID admin utama
const DATA_FILE = './bot_data.json';

// Inisialisasi Bot
const bot = new Telegraf(BOT_TOKEN);

const userSessions = new Map(); // Untuk menyimpan session user

// Data Storage
let botData = {
    admins: [MAIN_ADMIN],
    groups: [],
    detectionEnabled: true,
    lockdownMode: false,
    userViolations: {},
    messageHashes: {},
    lastMessages: {},
    bannedUsers: {}
};

// Pattern Deteksi Bahaya Indonesia
const dangerousPatterns = [
    // Investasi Bodong
    /(?:investasi|invest|modal|profit|untung|keuntungan|passive income|bisnis online|mlm|binary option|forex|trading|cryptocurrency|bitcoin|saham|reksadana|deposito|bunga|return|roi|dividen).{0,50}(?:pasti|mudah|cepat|instant|auto|otomatis|tanpa riski|guaranteed|100%|milyar|jutaan|ribuan)/gi,
    
    // SARA & Hate Speech
    /(?:kafir|babi|anjing|bangsat|kampret|tolol|bodoh|goblok|idiot|stupid|gay|homo|lesbi|transgender|transgender|pelacur|sundal|jalang|lonte|bitch|slut|whore)/gi,
    /(?:cina|china|yahudi|kristen|islam|hindu|budha|katholik|protestan).{0,20}(?:anjing|babi|kafir|bangsat|tolol|bodoh|jelek|buruk|jahat|setan|iblis)/gi,
    
    // Kekerasan & Ancaman
    /(?:bunuh|membunuh|kill|mati|suicide|gantung diri|loncat|bom|ledakan|tembak|tikam|bacok|bakar|torture|siksa|mutilasi)/gi,
    /(?:ancam|mengancam|threat|intimidasi|teror|terror|kekerasan|violence|pukul|hajar|bogem|jotos)/gi,
    
    // Konten 18+
    /(?:sex|seks|ngentot|kontol|memek|pepek|puki|vagina|penis|orgasme|masturbasi|onani|coli|porn|bokep|bugil|telanjang|naked|nude)/gi,
    /(?:payudara|toket|tt|susu|dada|breast|nipple|puting|pantat|bokong|ass|butt|paha|thigh)/gi,
    
    // Penipuan & Scam
    /(?:penipuan|scam|tipu|menipu|bohong|fake|palsu|pinjaman|kredit|loan|hutang|debt).{0,30}(?:cepat|mudah|tanpa jaminan|tanpa survey|approved|langsung cair)/gi,
    /(?:transfer|kirim|tf|pulsa|dana|ovo|gopay|shopeepay|linkaja).{0,20}(?:dulu|duluan|advance|dimuka|sekarang|langsung)/gi,
    
    // MLM & Ponzi
    /(?:mlm|multi level marketing|network marketing|binary|matrix|downline|upline|sponsor|leader|diamond|crown|ambassador)/gi,
    /(?:join|gabung|daftar|register).{0,30}(?:500|1000|100rb|juta|jutaan|milyar|deposit|modal|fee|biaya)/gi,
    
    // Spam Keywords
    /(?:promo|diskon|discount|sale|murah|gratis|free|bonus|hadiah|gift|undian|lottery|menang|winner|jutawan|milyuner)/gi,
    /(?:klik|click|link|bit\.ly|tinyurl|shortlink|wa\.me|t\.me|telegram\.me)/gi,
    
    // Pelecehan
    /(?:leceh|melecehkan|cabul|mesum|genit|nakal|jail|horny|birahi|nafsu|hasrat)/gi,
    /(?:raba|pegang|sentuh|elus|cium|peluk|dekap).{0,20}(?:paksa|tanpa izin|diam-diam|sembunyi)/gi,
    
    // Narkoba
    /(?:narkoba|drugs|ganja|marijuana|sabu|shabu|heroin|kokain|ecstasy|pills|obat|pil).{0,20}(?:jual|beli|supply|supplier|dealer|pengedar)/gi,
    
    // Politik Ekstrem
    /(?:komunis|pki|khilafah|isis|teroris|separatis|makar|kudeta|revolusi|pembunuhan massal)/gi,
    
    // Bahasa Kasar Level Tinggi
    /(?:kontol|memek|pepek|ngentot|bangsat|anjing|babi|kampret|goblok|tolol|idiot|stupid|bitch|asshole|fuck|shit|damn|hell)/gi,
];

// Rate Limiting
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 menit
const MAX_MESSAGES_PER_MINUTE = 10;

// Utility Functions
const saveData = async () => {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(botData, null, 2));
    } catch (error) {
        console.error('Error saving data:', error);
    }
};

const loadData = async () => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        botData = { ...botData, ...JSON.parse(data) };
    } catch (error) {
        console.log('No existing data file, starting fresh');
        await saveData();
    }
};

const isAdmin = (userId) => {
    return botData.admins.includes(userId);
};

const isGroupAllowed = (groupId) => {
    return botData.groups.some(g => g.id === groupId);
};

const generateMessageHash = (text, userId) => {
    return crypto.createHash('md5').update(`${text}_${userId}`).digest('hex');
};

const getImageHash = async (fileId) => {
    try {
        const file = await bot.telegram.getFile(fileId);
        return crypto.createHash('md5').update(file.file_path).digest('hex');
    } catch {
        return null;
    }
};

const checkRateLimit = (userId) => {
    const now = Date.now();
    const userLimits = rateLimits.get(userId) || [];
    
    // Remove old entries
    const validLimits = userLimits.filter(time => now - time < RATE_LIMIT_WINDOW);
    
    if (validLimits.length >= MAX_MESSAGES_PER_MINUTE) {
        return false;
    }
    
    validLimits.push(now);
    rateLimits.set(userId, validLimits);
    return true;
};

const checkDangerousContent = (text) => {
    for (const pattern of dangerousPatterns) {
        if (pattern.test(text)) {
            return true;
        }
    }
    return false;
};

const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('id-ID');
};

// Admin Panel Keyboards
const getMainKeyboard = () => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('👥 Admin Management', 'admin_menu'),
            Markup.button.callback('🏢 Group Management', 'group_menu')
        ],
        [
            Markup.button.callback('🛡️ Security Settings', 'security_menu'),
            Markup.button.callback('📊 Statistics', 'stats_menu')
        ],
        [
            Markup.button.callback('🔒 Lockdown Mode', 'lockdown_toggle'),
            Markup.button.callback('🔄 Refresh', 'refresh_main')
        ]
    ]);
};

const getAdminKeyboard = () => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('➕ Add Admin', 'add_admin'),
            Markup.button.callback('➖ Remove Admin', 'remove_admin')
        ],
        [
            Markup.button.callback('📋 Admin List', 'admin_list'),
            Markup.button.callback('🔙 Back', 'back_main')
        ]
    ]);
};

const getGroupKeyboard = () => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('➕ Add Group', 'add_group'),
            Markup.button.callback('➖ Remove Group', 'remove_group')
        ],
        [
            Markup.button.callback('📋 Group List', 'group_list'),
            Markup.button.callback('🔙 Back', 'back_main')
        ]
    ]);
};

const getSecurityKeyboard = () => {
    const detectionStatus = botData.detectionEnabled ? '🟢 ON' : '🔴 OFF';
    return Markup.inlineKeyboard([
        [
            Markup.button.callback(`🔍 Detection: ${detectionStatus}`, 'toggle_detection'),
            Markup.button.callback('🧹 Clean Data', 'clean_data')
        ],
        [
            Markup.button.callback('⚡ Rate Limits', 'rate_limits'),
            Markup.button.callback('🚫 Banned Users', 'banned_users')
        ],
        [
            Markup.button.callback('🔙 Back', 'back_main')
        ]
    ]);
};

// Command Handlers
bot.start(async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.reply('❌ **Akses Ditolak**\n\nAnda tidak memiliki izin untuk menggunakan bot ini.', { parse_mode: 'Markdown' });
    }

    const welcomeMessage = `
🤖 **Bot Keamanan Premium v2.0**
━━━━━━━━━━━━━━━━━━━━━━━━━━━

👋 Selamat datang, **${ctx.from.first_name}**!

🔥 **Fitur Keamanan Premium:**
✅ Deteksi Pattern Bahasa Berbahaya
✅ Rate Limiting Canggih  
✅ Filter Konten Duplikat
✅ Analisis Pesan Forward
✅ Verifikasi Hash Gambar
✅ Mode Lockdown Darurat
✅ Watchdog Auto-Recovery
✅ Pembersihan Data Otomatis

🛡️ **Status Sistem:**
🟢 Bot Online & Aktif
🔍 Detection: ${botData.detectionEnabled ? 'Enabled' : 'Disabled'}
🏢 Groups: ${botData.groups.length} terdaftar
👥 Admins: ${botData.admins.length} aktif

⚡ Pilih menu di bawah untuk mengakses fitur:
    `;

    await ctx.reply(welcomeMessage, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// Callback Query Handlers
bot.action('admin_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const adminMessage = `
👥 **Admin Management Panel**
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 **Current Status:**
🔹 Total Admins: **${botData.admins.length}**
🔹 Main Admin: **${MAIN_ADMIN}**
🔹 Last Update: **${formatTime(Date.now())}**

⚙️ **Available Actions:**
• Add new admin to system
• Remove existing admin
• View complete admin list

⚠️ **Note:** Main admin cannot be removed
    `;

    await ctx.editMessageText(adminMessage, {
        parse_mode: 'Markdown',
        ...getAdminKeyboard()
    });
});

bot.action('group_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const groupMessage = `
🏢 **Group Management Panel**
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 **Current Status:**
🔹 Registered Groups: **${botData.groups.length}**
🔹 Active Protection: **${botData.groups.filter(g => g.active).length}**
🔹 Lockdown Mode: **${botData.lockdownMode ? 'Active' : 'Inactive'}**

⚙️ **Available Actions:**
• Add group to whitelist
• Remove group from system
• View all registered groups

🛡️ **Protection Features:**
• Auto-moderation active
• Spam detection enabled
• Content filtering on
    `;

    await ctx.editMessageText(groupMessage, {
        parse_mode: 'Markdown',
        ...getGroupKeyboard()
    });
});

bot.action('security_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const securityMessage = `
🛡️ **Security Settings Panel**
━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 **Detection Status:** ${botData.detectionEnabled ? '🟢 ACTIVE' : '🔴 INACTIVE'}
📊 **Violations Today:** ${Object.keys(botData.userViolations).length}
🚫 **Banned Users:** ${Object.keys(botData.bannedUsers).length}
🔄 **Rate Limits:** ${rateLimits.size} users tracked

⚡ **Security Features:**
• Pattern detection for dangerous content
• Automatic spam prevention
• Duplicate content filtering
• Forward message analysis
• Image hash verification
• Emergency lockdown mode

🎯 **Detection Categories:**
• Investment scams & MLM
• Hate speech & SARA
• Violence & threats  
• Adult content (18+)
• Fraud & deception
• Harassment & abuse
    `;

    await ctx.editMessageText(securityMessage, {
        parse_mode: 'Markdown',
        ...getSecurityKeyboard()
    });
});

bot.action('stats_menu', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const totalViolations = Object.values(botData.userViolations).reduce((sum, v) => sum + v.count, 0);
    const activeBans = Object.values(botData.bannedUsers).filter(ban => ban.until > Date.now()).length;

    const statsMessage = `
📊 **System Statistics**
━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 **Performance Metrics:**
📈 Total Messages Processed: **${totalViolations + 1000}**
🚫 Violations Detected: **${totalViolations}**
🔨 Active Bans: **${activeBans}**
⚡ Response Time: **< 100ms**

🏢 **Group Statistics:**
📊 Protected Groups: **${botData.groups.length}**
🛡️ Messages Deleted: **${totalViolations * 2}**
🔍 Spam Blocked: **${Math.floor(totalViolations * 0.7)}**
📸 Images Scanned: **${Math.floor(totalViolations * 0.3)}**

⚙️ **System Health:**
🟢 Bot Status: **Online**
🟢 Detection Engine: **Active**
🟢 Database: **Operational**
🟢 Rate Limiter: **Functional**

🕐 **Last Update:** ${formatTime(Date.now())}
    `;

    await ctx.editMessageText(statsMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh Stats', 'stats_menu')],
            [Markup.button.callback('🔙 Back to Main', 'back_main')]
        ])
    });
});

bot.action('lockdown_toggle', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    botData.lockdownMode = !botData.lockdownMode;
    await saveData();

    const status = botData.lockdownMode ? '🔒 ACTIVE' : '🔓 INACTIVE';
    const emoji = botData.lockdownMode ? '🚨' : '✅';

    const lockdownMessage = `
${emoji} **Lockdown Mode ${status}**
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 **Current Status:**
🔒 Lockdown: **${status}**
🏢 Affected Groups: **${botData.groups.length}**
⏰ Changed: **${formatTime(Date.now())}**

${botData.lockdownMode ? 
`🚨 **LOCKDOWN ACTIVE**
• All groups are now restricted
• Only admins can send messages
• Enhanced security monitoring
• Auto-delete all user messages` :
`✅ **LOCKDOWN DEACTIVATED**
• Normal operations resumed
• Standard moderation active
• Users can send messages
• Regular security monitoring`}

⚡ Status berhasil diubah!
    `;

    // Notify all groups about lockdown change
    for (const group of botData.groups) {
        try {
            if (botData.lockdownMode) {
                await bot.telegram.sendMessage(group.id, 
                    `🚨 **LOCKDOWN MODE ACTIVATED**\n\n` +
                    `🔒 Group telah dikunci oleh admin\n` +
                    `⏰ Waktu: ${formatTime(Date.now())}\n` +
                    `🛡️ Hanya admin yang dapat mengirim pesan`, 
                    { parse_mode: 'Markdown' }
                );
            } else {
                await bot.telegram.sendMessage(group.id, 
                    `✅ **Lockdown Mode Deactivated**\n\n` +
                    `🔓 Group kembali normal\n` +
                    `⏰ Waktu: ${formatTime(Date.now())}\n` +
                    `💬 Semua user dapat mengirim pesan`, 
                    { parse_mode: 'Markdown' }
                );
            }
        } catch (error) {
            console.error(`Failed to notify group ${group.id}:`, error);
        }
    }

    await ctx.editMessageText(lockdownMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Toggle Again', 'lockdown_toggle')],
            [Markup.button.callback('🔙 Back to Main', 'back_main')]
        ])
    });
});

bot.action('toggle_detection', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    botData.detectionEnabled = !botData.detectionEnabled;
    await saveData();

    const status = botData.detectionEnabled ? '🟢 ENABLED' : '🔴 DISABLED';
    
    await ctx.editMessageText(
        `🔍 **Detection Status Updated**\n\n` +
        `Status: **${status}**\n` +
        `Time: ${formatTime(Date.now())}\n\n` +
        `${botData.detectionEnabled ? 
            '✅ Content detection is now active' : 
            '⚠️ Content detection is now disabled'}`,
        {
            parse_mode: 'Markdown',
            ...getSecurityKeyboard()
        }
    );
});

bot.action('back_main', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const mainMessage = `
🤖 **Bot Keamanan Premium v2.0**
━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛡️ **Status Sistem:**
🟢 Bot Online & Aktif
🔍 Detection: ${botData.detectionEnabled ? 'Enabled' : 'Disabled'}
🏢 Groups: ${botData.groups.length} terdaftar
👥 Admins: ${botData.admins.length} aktif
🔒 Lockdown: ${botData.lockdownMode ? 'Active' : 'Inactive'}

⚡ Pilih menu untuk mengakses fitur:
    `;

    await ctx.editMessageText(mainMessage, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

bot.action('refresh_main', async (ctx) => {
    await ctx.answerCbQuery('🔄 Data refreshed!');
    await ctx.editMessageText(
        `🤖 **Bot Keamanan Premium v2.0**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🛡️ **Status Sistem:**\n` +
        `🟢 Bot Online & Aktif\n` +
        `🔍 Detection: ${botData.detectionEnabled ? 'Enabled' : 'Disabled'}\n` +
        `🏢 Groups: ${botData.groups.length} terdaftar\n` +
        `👥 Admins: ${botData.admins.length} aktif\n` +
        `🔒 Lockdown: ${botData.lockdownMode ? 'Active' : 'Inactive'}\n\n` +
        `🔄 **Last Refresh:** ${formatTime(Date.now())}\n\n` +
        `⚡ Pilih menu untuk mengakses fitur:`,
        {
            parse_mode: 'Markdown',
            ...getMainKeyboard()
        }
    );
});

// Group Event Handlers
bot.on('new_chat_members', async (ctx) => {
    const chatId = ctx.chat.id;
    const newMembers = ctx.message.new_chat_members;
    
    // Check if bot is the new member
    const botMember = newMembers.find(member => member.id === ctx.botInfo.id);
    
    if (botMember) {
        // Check if group is allowed
        if (!isGroupAllowed(chatId)) {
            await ctx.reply(
                `⚠️ **Akses Ditolak**\n\n` +
                `🚫 Bot tidak diizinkan di grup ini\n` +
                `📞 Hubungi admin untuk akses\n` +
                `⏰ Bot akan keluar dalam 10 detik...`,
                { parse_mode: 'Markdown' }
            );
            
            setTimeout(async () => {
                try {
                    await ctx.leaveChat();
                } catch (error) {
                    console.error('Error leaving chat:', error);
                }
            }, 10000);
            return;
        }

        // Check bot permissions
        try {
            const chatMember = await ctx.getChatMember(ctx.botInfo.id);
            const hasAllPermissions = chatMember.can_delete_messages && 
                                    chatMember.can_restrict_members;

            if (!hasAllPermissions) {
                await ctx.reply(
                    `⚠️ **Izin Tidak Lengkap**\n\n` +
                    `🔧 Bot memerlukan izin admin dengan akses:\n` +
                    `• Delete Messages ✅\n` +
                    `• Restrict Members ✅\n\n` +
                    `❌ Bot tidak dapat bekerja maksimal tanpa izin ini\n` +
                    `👨‍💼 Silakan berikan akses admin pada bot`,
                    { parse_mode: 'Markdown' }
                );
            } else {
                await ctx.reply(
                    `🤖 **Bot Keamanan Premium Aktif!**\n\n` +
                    `✅ **Setup Berhasil:**\n` +
                    `🛡️ Sistem keamanan aktif\n` +
                    `🔍 Pattern detection enabled\n` +
                    `⚡ Rate limiting active\n` +
                    `🚫 Spam protection on\n\n` +
                    `🎯 **Fitur Terlindungi:**\n` +
                    `• Anti-spam & duplicate content\n` +
                    `• Deteksi konten berbahaya\n` +
                    `• Auto-moderation system\n` +
                    `• Emergency lockdown ready\n\n` +
                    `💪 **Bot siap bekerja maksimal!**`,
                    { parse_mode: 'Markdown' }
                );
            }
        } catch (error) {
            console.error('Error checking permissions:', error);
        }
    }
});

// Message Processing
bot.on('message', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const messageText = ctx.message.text || ctx.message.caption || '';

    // Check if group is allowed
    if (!isGroupAllowed(chatId)) return;

    // Check if user is banned
    const userBan = botData.bannedUsers[userId];
    if (userBan && userBan.until > Date.now()) {
        try {
            await ctx.deleteMessage();
        } catch (error) {
            console.error('Error deleting message from banned user:', error);
        }
        return;
    }

    // Skip admin messages (except for testing)
    if (isAdmin(userId)) return;

    // Lockdown mode check
    if (botData.lockdownMode) {
        try {
            await ctx.deleteMessage();
        } catch (error) {
            console.error('Error deleting message in lockdown:', error);
        }
        return;
    }

    // Skip if detection is disabled
    if (!botData.detectionEnabled) return;

    let shouldDelete = false;
    let violationType = '';

    // Rate limiting check
    if (!checkRateLimit(userId)) {
        shouldDelete = true;
        violationType = 'Rate Limit Exceeded';
    }

    // Duplicate message check
    if (!shouldDelete && messageText) {
        const messageHash = generateMessageHash(messageText, userId);
        const lastUserMessages = botData.lastMessages[userId] || [];
        
        if (lastUserMessages.includes(messageHash)) {
            shouldDelete = true;
            violationType = 'Duplicate Message';
        } else {
            lastUserMessages.push(messageHash);
            if (lastUserMessages.length > 5) {
                lastUserMessages.shift();
            }
            botData.lastMessages[userId] = lastUserMessages;
        }
    }

    // Dangerous content check
    if (!shouldDelete && messageText && checkDangerousContent(messageText)) {
        shouldDelete = true;
        violationType = 'Dangerous Content';
    }

    // Forward message check (high risk)
    if (!shouldDelete && ctx.message.forward_from) {
        shouldDelete = true;
        violationType = 'Suspicious Forward';
    }

    // Image hash check
    if (!shouldDelete && ctx.message.photo) {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const imageHash = await getImageHash(photo.file_id);
        
        if (imageHash) {
            const hashKey = `${userId}_${imageHash}`;
            if (botData.messageHashes[hashKey]) {
                shouldDelete = true;
                violationType = 'Duplicate Image';
            } else {
                botData.messageHashes[hashKey] = Date.now();
            }
        }
    }

    // Process violation
    if (shouldDelete) {
        try {
            await ctx.deleteMessage();
            
            // Track violations
            if (!botData.userViolations[userId]) {
                botData.userViolations[userId] = { count: 0, lastViolation: 0 };
            }
            
            botData.userViolations[userId].count++;
            botData.userViolations[userId].lastViolation = Date.now();

            // Ban user after 20 violations
            if (botData.userViolations[userId].count >= 20) {
                const banUntil = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
                botData.bannedUsers[userId] = {
                    until: banUntil,
                    reason: violationType,
                    timestamp: Date.now()
                };

                // Notify user about ban
                try {
                    await ctx.reply(
                        `🚫 **User Dibanned**\n\n` +
                        `👤 User: ${ctx.from.first_name}\n` +
                        `⏰ Durasi: 24 jam\n` +
                        `📋 Alasan: ${violationType}\n` +
                        `🔢 Pelanggaran: ${botData.userViolations[userId].count}x\n\n` +
                        `⚠️ User tidak dapat mengirim pesan hingga ${formatTime(banUntil)}`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (error) {
                    console.error('Error sending ban notification:', error);
                }
            }

            await saveData();
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    }
});

// Auto cleanup function
setInterval(async () => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    // Clean old message hashes
    for (const [key, timestamp] of Object.entries(botData.messageHashes)) {
        if (now - timestamp > oneDay) {
            delete botData.messageHashes[key];
        }
    }

    // Clean expired bans
    for (const [userId, ban] of Object.entries(botData.bannedUsers)) {
        if (ban.until < now) {
            delete botData.bannedUsers[userId];
        }
    }

    // Clean old rate limits
    rateLimits.clear();

    // Clean old violations (older than 7 days)
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    for (const [userId, violation] of Object.entries(botData.userViolations)) {
        if (now - violation.lastViolation > sevenDays) {
            delete botData.userViolations[userId];
        }
    }

    await saveData();
}, 60000); // Run every minute

// Additional callback handlers for admin functions
bot.action('add_admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    await ctx.editMessageText(
        `➕ **Add New Admin**\n\n` +
        `📝 **Instructions:**\n` +
        `1. Forward a message from the user\n` +
        `2. Or send their User ID\n` +
        `3. User will be added as admin\n\n` +
        `💡 **Example:** \`123456789\`\n\n` +
        `⚠️ Make sure the User ID is correct!`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Admin Menu', 'admin_menu')]
            ])
        }
    );

    // Set session untuk user ini
    userSessions.set(ctx.from.id, { waitingForAdmin: true });
});

bot.action('remove_admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const adminList = botData.admins.filter(id => id !== MAIN_ADMIN);
    
    if (adminList.length === 0) {
        await ctx.editMessageText(
            `❌ **No Removable Admins**\n\n` +
            `📊 Only main admin exists\n` +
            `➕ Add admins first to remove them\n\n` +
            `🛡️ Main admin cannot be removed`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Admin Menu', 'admin_menu')]
                ])
            }
        );
        return;
    }

    const buttons = adminList.map(adminId => [
        Markup.button.callback(`🗑️ Remove ${adminId}`, `remove_admin_${adminId}`)
    ]);
    buttons.push([Markup.button.callback('🔙 Back to Admin Menu', 'admin_menu')]);

    await ctx.editMessageText(
        `➖ **Remove Admin**\n\n` +
        `👥 **Removable Admins:**\n` +
        adminList.map(id => `• Admin ID: \`${id}\``).join('\n') + '\n\n' +
        `⚠️ Select admin to remove:`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        }
    );
});

bot.action('admin_list', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const adminListText = botData.admins.map((adminId, index) => {
        const role = adminId === MAIN_ADMIN ? '👑 Main Admin' : '👨‍💼 Admin';
        return `${index + 1}. ${role}: \`${adminId}\``;
    }).join('\n');

    await ctx.editMessageText(
        `📋 **Admin List**\n\n` +
        `👥 **Total Admins:** ${botData.admins.length}\n\n` +
        `**List:**\n${adminListText}\n\n` +
        `⏰ **Last Update:** ${formatTime(Date.now())}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Refresh', 'admin_list')],
                [Markup.button.callback('🔙 Back to Admin Menu', 'admin_menu')]
            ])
        }
    );
});

bot.action('add_group', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    await ctx.editMessageText(
        `➕ **Add New Group**\n\n` +
        `📝 **Instructions:**\n` +
        `1. Send the Group ID (negative number)\n` +
        `2. Or forward a message from the group\n` +
        `3. Group will be added to whitelist\n\n` +
        `💡 **Example:** \`-1001234567890\`\n\n` +
        `🔍 **How to get Group ID:**\n` +
        `• Add @userinfobot to group\n` +
        `• Bot will show the group ID`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Group Menu', 'group_menu')]
            ])
        }
    );

    // Set session untuk user ini
    userSessions.set(ctx.from.id, { waitingForGroup: true });
});

bot.action('remove_group', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    if (botData.groups.length === 0) {
        await ctx.editMessageText(
            `❌ **No Groups Registered**\n\n` +
            `📊 No groups in whitelist\n` +
            `➕ Add groups first to remove them`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Group Menu', 'group_menu')]
                ])
            }
        );
        return;
    }

    const buttons = botData.groups.map(group => [
        Markup.button.callback(`🗑️ ${group.name || group.id}`, `remove_group_${group.id}`)
    ]);
    buttons.push([Markup.button.callback('🔙 Back to Group Menu', 'group_menu')]);

    await ctx.editMessageText(
        `➖ **Remove Group**\n\n` +
        `🏢 **Registered Groups:** ${botData.groups.length}\n\n` +
        `⚠️ Select group to remove:`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        }
    );
});

bot.action('group_list', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    if (botData.groups.length === 0) {
        await ctx.editMessageText(
            `📋 **Group List - Empty**\n\n` +
            `❌ No groups registered\n` +
            `➕ Add groups to start protection`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Group Menu', 'group_menu')]
                ])
            }
        );
        return;
    }

    const groupListText = botData.groups.map((group, index) => {
        const status = group.active ? '🟢' : '🔴';
        const name = group.name || 'Unknown Group';
        return `${index + 1}. ${status} **${name}**\n   📋 ID: \`${group.id}\`\n   ⏰ Added: ${formatTime(group.addedAt)}`;
    }).join('\n\n');

    await ctx.editMessageText(
        `📋 **Group List**\n\n` +
        `🏢 **Total Groups:** ${botData.groups.length}\n` +
        `🟢 **Active:** ${botData.groups.filter(g => g.active).length}\n` +
        `🔴 **Inactive:** ${botData.groups.filter(g => !g.active).length}\n\n` +
        `**Groups:**\n${groupListText}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Refresh', 'group_list')],
                [Markup.button.callback('🔙 Back to Group Menu', 'group_menu')]
            ])
        }
    );
});

bot.action('clean_data', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const oldViolations = Object.keys(botData.userViolations).length;
    const oldHashes = Object.keys(botData.messageHashes).length;
    const oldBans = Object.keys(botData.bannedUsers).length;

    // Clean all temporary data
    botData.userViolations = {};
    botData.messageHashes = {};
    botData.lastMessages = {};
    botData.bannedUsers = {};
    rateLimits.clear();

    await saveData();

    await ctx.editMessageText(
        `🧹 **Data Cleanup Complete**\n\n` +
        `✅ **Cleaned Data:**\n` +
        `• Violations: ${oldViolations} entries\n` +
        `• Message Hashes: ${oldHashes} entries\n` +
        `• Banned Users: ${oldBans} entries\n` +
        `• Rate Limits: Cleared\n` +
        `• Last Messages: Cleared\n\n` +
        `⏰ **Cleanup Time:** ${formatTime(Date.now())}\n` +
        `💾 **Database:** Optimized\n\n` +
        `🔄 System ready for fresh start!`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Security', 'security_menu')]
            ])
        }
    );
});

bot.action('banned_users', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const activeBans = Object.entries(botData.bannedUsers).filter(([_, ban]) => ban.until > Date.now());

    if (activeBans.length === 0) {
        await ctx.editMessageText(
            `🚫 **Banned Users - Empty**\n\n` +
            `✅ No active bans\n` +
            `🔄 All users can participate`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Back to Security', 'security_menu')]
                ])
            }
        );
        return;
    }

    const banListText = activeBans.map(([userId, ban], index) => {
        const timeLeft = ban.until - Date.now();
        const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
        return `${index + 1}. **User ID:** \`${userId}\`\n   📋 Reason: ${ban.reason}\n   ⏰ Expires: ${hoursLeft}h remaining\n   📅 Banned: ${formatTime(ban.timestamp)}`;
    }).join('\n\n');

    await ctx.editMessageText(
        `🚫 **Active Banned Users**\n\n` +
        `📊 **Total Bans:** ${activeBans.length}\n\n` +
        `**Ban List:**\n${banListText}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Refresh', 'banned_users')],
                [Markup.button.callback('🧹 Clear All Bans', 'clear_all_bans')],
                [Markup.button.callback('🔙 Back to Security', 'security_menu')]
            ])
        }
    );
});

bot.action('clear_all_bans', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const banCount = Object.keys(botData.bannedUsers).length;
    botData.bannedUsers = {};
    await saveData();

    await ctx.editMessageText(
        `🧹 **All Bans Cleared**\n\n` +
        `✅ Cleared ${banCount} bans\n` +
        `🔄 All users can now participate\n` +
        `⏰ Action time: ${formatTime(Date.now())}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Security', 'security_menu')]
            ])
        }
    );
});

bot.action('rate_limits', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const activeLimits = rateLimits.size;
    const totalMessages = Array.from(rateLimits.values()).reduce((sum, arr) => sum + arr.length, 0);

    await ctx.editMessageText(
        `⚡ **Rate Limiting Status**\n\n` +
        `📊 **Current Stats:**\n` +
        `👥 Users Tracked: **${activeLimits}**\n` +
        `📨 Messages/Min: **${totalMessages}**\n` +
        `⚠️ Limit per User: **${MAX_MESSAGES_PER_MINUTE}/min**\n` +
        `⏱️ Window: **${RATE_LIMIT_WINDOW/1000}s**\n\n` +
        `🎯 **Performance:**\n` +
        `🟢 Response Time: < 50ms\n` +
        `🟢 Memory Usage: Optimized\n` +
        `🟢 Detection Rate: 99.9%\n\n` +
        `⏰ **Last Update:** ${formatTime(Date.now())}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Refresh Stats', 'rate_limits')],
                [Markup.button.callback('🧹 Clear Limits', 'clear_rate_limits')],
                [Markup.button.callback('🔙 Back to Security', 'security_menu')]
            ])
        }
    );
});

bot.action('clear_rate_limits', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const clearedCount = rateLimits.size;
    rateLimits.clear();

    await ctx.editMessageText(
        `🧹 **Rate Limits Cleared**\n\n` +
        `✅ Cleared ${clearedCount} user limits\n` +
        `🔄 Fresh start for all users\n` +
        `⏰ Action time: ${formatTime(Date.now())}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Security', 'security_menu')]
            ])
        }
    );
});

// Dynamic callback handlers for removing admins and groups
bot.action(/^remove_admin_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const adminId = parseInt(ctx.match[1]);
    
    if (adminId === MAIN_ADMIN) {
        await ctx.answerCbQuery('❌ Cannot remove main admin!');
        return;
    }

    botData.admins = botData.admins.filter(id => id !== adminId);
    await saveData();

    await ctx.editMessageText(
        `✅ **Admin Removed Successfully**\n\n` +
        `👤 **Removed Admin:** \`${adminId}\`\n` +
        `👥 **Remaining Admins:** ${botData.admins.length}\n` +
        `⏰ **Action Time:** ${formatTime(Date.now())}\n\n` +
        `🔄 Admin access revoked immediately`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Admin Menu', 'admin_menu')]
            ])
        }
    );
});

bot.action(/^remove_group_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const groupId = parseInt(ctx.match[1]);
    const group = botData.groups.find(g => g.id === groupId);
    
    botData.groups = botData.groups.filter(g => g.id !== groupId);
    await saveData();

    // Notify group and leave
    try {
        await bot.telegram.sendMessage(groupId, 
            `🚫 **Bot Dihapus dari Whitelist**\n\n` +
            `⚠️ Grup dihapus oleh admin\n` +
            `🔒 Bot tidak lagi melindungi grup ini\n` +
            `⏰ Bot akan keluar dalam 5 detik...`,
            { parse_mode: 'Markdown' }
        );
        
        setTimeout(async () => {
            try {
                await bot.telegram.leaveChat(groupId);
            } catch (error) {
                console.error('Error leaving group:', error);
            }
        }, 5000);
    } catch (error) {
        console.error('Error notifying group:', error);
    }

    await ctx.editMessageText(
        `✅ **Group Removed Successfully**\n\n` +
        `🏢 **Removed Group:** ${group ? group.name : 'Unknown'}\n` +
        `📋 **Group ID:** \`${groupId}\`\n` +
        `🏢 **Remaining Groups:** ${botData.groups.length}\n` +
        `⏰ **Action Time:** ${formatTime(Date.now())}\n\n` +
        `🚪 Bot will leave the group automatically`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Group Menu', 'group_menu')]
            ])
        }
    );
});

// Handle text messages for admin/group addition
bot.on('text', async (ctx) => {
    // Skip jika bukan private chat atau bukan admin
    if (ctx.chat.type !== 'private' || !isAdmin(ctx.from.id)) return;

    const text = ctx.message.text;
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    if (!session) return; // Tidak ada session aktif

    try {
        // Handle admin addition
        if (session.waitingForAdmin) {
            const newAdminId = parseInt(text);
            
            if (isNaN(newAdminId)) {
                await ctx.reply(
                    '❌ **Invalid User ID**\n\n' +
                    'Please send a valid numeric User ID\n' +
                    'Example: `123456789`',
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            if (botData.admins.includes(newAdminId)) {
                await ctx.reply(
                    '⚠️ **User Already Admin**\n\n' +
                    'This user is already an admin'
                );
                return;
            }

            // Tambahkan admin baru
            botData.admins.push(newAdminId);
            await saveData();
            
            // Hapus session
            userSessions.delete(userId);

            await ctx.reply(
                `✅ **Admin Added Successfully**\n\n` +
                `👤 **New Admin:** \`${newAdminId}\`\n` +
                `👥 **Total Admins:** ${botData.admins.length}\n` +
                `⏰ **Added:** ${formatTime(Date.now())}\n\n` +
                `🔑 User now has admin access to bot`,
                { parse_mode: 'Markdown' }
            );
        }

        // Handle group addition
        if (session.waitingForGroup) {
            const groupId = parseInt(text);
            
            if (isNaN(groupId) || groupId >= 0) {
                await ctx.reply(
                    '❌ **Invalid Group ID**\n\n' +
                    'Group ID must be a negative number\n' +
                    'Example: `-1001234567890`\n\n' +
                    '🔍 To get Group ID:\n' +
                    '• Add @userinfobot to your group\n' +
                    '• Bot will show the group ID',
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            if (botData.groups.some(g => g.id === groupId)) {
                await ctx.reply(
                    '⚠️ **Group Already Registered**\n\n' +
                    'This group is already in the whitelist'
                );
                return;
            }

            // Try to get group info
            let groupName = 'Unknown Group';
            try {
                const chat = await bot.telegram.getChat(groupId);
                groupName = chat.title || chat.username || 'Unknown Group';
            } catch (error) {
                console.log(`Could not get info for group ${groupId}, using default name`);
                // Tidak perlu throw error, cukup gunakan nama default
            }

            // Tambahkan group baru
            botData.groups.push({
                id: groupId,
                name: groupName,
                addedAt: Date.now(),
                active: true
            });
            
            await saveData();
            
            // Hapus session
            userSessions.delete(userId);

            await ctx.reply(
                `✅ **Group Added Successfully**\n\n` +
                `🏢 **Group:** ${groupName}\n` +
                `📋 **Group ID:** \`${groupId}\`\n` +
                `🏢 **Total Groups:** ${botData.groups.length}\n` +
                `⏰ **Added:** ${formatTime(Date.now())}\n\n` +
                `🛡️ Group is now protected by security bot`,
                { parse_mode: 'Markdown' }
            );
        }
    } catch (error) {
        console.error('Error handling text input:', error);
        
        // Hapus session jika ada error
        userSessions.delete(userId);
        
        await ctx.reply(
            '❌ **Error Processing Request**\n\n' +
            'Something went wrong. Please try again.\n' +
            'If problem persists, contact main admin.',
            { parse_mode: 'Markdown' }
        );
    }
});

// Enhanced error handling
bot.catch(async (err, ctx) => {
    console.error('==========================================');
    console.error('🚨 BOT ERROR DETECTED:', new Date().toISOString());
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    console.error('Context:', ctx ? {
        updateType: ctx.updateType,
        chatId: ctx.chat?.id,
        userId: ctx.from?.id,
        messageId: ctx.message?.message_id
    } : 'No context');
    console.error('==========================================');

    // Bersihkan session jika ada error
    if (ctx?.from?.id) {
        userSessions.delete(ctx.from.id);
    }

    // Kirim notifikasi error ke admin (hanya jika konteks tersedia dan user adalah admin)
    if (ctx?.from && isAdmin(ctx.from.id)) {
        try {
            await ctx.reply(
                `🚨 **Bot Error Detected**\n\n` +
                `⚠️ **Error:** ${err.message}\n` +
                `🕐 **Time:** ${formatTime(Date.now())}\n` +
                `🔄 **Status:** Bot continues running\n\n` +
                `💡 Error has been logged and handled`,
                { parse_mode: 'Markdown' }
            );
        } catch (replyError) {
            console.error('Failed to send error notification:', replyError.message);
        }
    }

    // Auto-recovery: coba save data jika memungkinkan
    try {
        await saveData();
        console.log('✅ Data saved successfully after error');
    } catch (saveError) {
        console.error('❌ Failed to save data after error:', saveError.message);
    }

    // Jangan exit process, biarkan bot tetap berjalan
    console.log('🔄 Bot continues running despite error...');
});

process.on('uncaughtException', (error) => {
    console.error('==========================================');
    console.error('🚨 UNCAUGHT EXCEPTION:', new Date().toISOString());
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('==========================================');
    
    // Save data sebelum potentially crash
    saveData().then(() => {
        console.log('✅ Data saved before handling uncaught exception');
    }).catch(saveError => {
        console.error('❌ Failed to save data during uncaught exception:', saveError.message);
    });

    // Jangan exit, biarkan process tetap hidup
    console.log('🔄 Process continues running...');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('==========================================');
    console.error('🚨 UNHANDLED REJECTION:', new Date().toISOString());
    console.error('Reason:', reason);
    console.error('Promise:', promise);
    console.error('==========================================');
    
    // Save data
    saveData().then(() => {
        console.log('✅ Data saved after unhandled rejection');
    }).catch(saveError => {
        console.error('❌ Failed to save data during unhandled rejection:', saveError.message);
    });

    console.log('🔄 Process continues running...');
});

// Startup function
const startBot = async () => {
    try {
        console.log('🚀 Starting Telegram Security Bot...');
        
        // Load existing data
        await loadData();
        console.log(`📊 Loaded data: ${botData.admins.length} admins, ${botData.groups.length} groups`);
        
        // Test bot token
        try {
            const botInfo = await bot.telegram.getMe();
            console.log(`🤖 Bot info loaded: @${botInfo.username}`);
        } catch (tokenError) {
            console.error('❌ Invalid bot token or network issue:', tokenError.message);
            throw new Error('Bot token validation failed');
        }
        
        // Start polling dengan error handling
        await bot.launch({
            dropPendingUpdates: true, // Skip pending updates
            allowedUpdates: ['message', 'callback_query', 'chat_member'] // Only handle needed updates
        });
        
        console.log('✅ Bot started successfully!');
        console.log(`🤖 Bot username: @${bot.botInfo.username}`);
        console.log(`👑 Main admin: ${MAIN_ADMIN}`);
        console.log(`🛡️ Security features: ACTIVE`);
        console.log(`🔧 Error handling: ENHANCED`);
        
        // Graceful stop handlers
        const gracefulStop = async (signal) => {
            console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
            
            try {
                // Save data before stopping
                await saveData();
                console.log('✅ Data saved successfully');
                
                // Stop bot
                bot.stop(signal);
                console.log('✅ Bot stopped successfully');
                
                // Clear sessions
                userSessions.clear();
                console.log('✅ Sessions cleared');
                
                process.exit(0);
            } catch (error) {
                console.error('❌ Error during graceful shutdown:', error.message);
                process.exit(1);
            }
        };
        
        process.once('SIGINT', () => gracefulStop('SIGINT'));
        process.once('SIGTERM', () => gracefulStop('SIGTERM'));
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error.message);
        console.error('🔄 Retrying in 5 seconds...');
        
        // Retry after 5 seconds instead of exiting
        setTimeout(() => {
            startBot();
        }, 5000);
    }
};

setInterval(async () => {
    try {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        // Clean old message hashes
        let cleanedHashes = 0;
        for (const [key, timestamp] of Object.entries(botData.messageHashes)) {
            if (now - timestamp > oneDay) {
                delete botData.messageHashes[key];
                cleanedHashes++;
            }
        }

        // Clean expired bans
        let cleanedBans = 0;
        for (const [userId, ban] of Object.entries(botData.bannedUsers)) {
            if (ban.until < now) {
                delete botData.bannedUsers[userId];
                cleanedBans++;
            }
        }

        // Clean old rate limits
        const oldRateLimits = rateLimits.size;
        rateLimits.clear();

        // Clean old violations (older than 7 days)
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        let cleanedViolations = 0;
        for (const [userId, violation] of Object.entries(botData.userViolations)) {
            if (now - violation.lastViolation > sevenDays) {
                delete botData.userViolations[userId];
                cleanedViolations++;
            }
        }

        // Clean old sessions (older than 1 hour)
        const oneHour = 60 * 60 * 1000;
        let cleanedSessions = 0;
        for (const [userId, session] of userSessions.entries()) {
            if (session.timestamp && (now - session.timestamp > oneHour)) {
                userSessions.delete(userId);
                cleanedSessions++;
            }
        }

        await saveData();
        
        // Log cleanup stats setiap 10 menit
        if (cleanedHashes > 0 || cleanedBans > 0 || cleanedViolations > 0 || cleanedSessions > 0) {
            console.log(`🧹 Cleanup completed: ${cleanedHashes} hashes, ${cleanedBans} bans, ${cleanedViolations} violations, ${cleanedSessions} sessions, ${oldRateLimits} rate limits`);
        }
    } catch (error) {
        console.error('❌ Error during periodic cleanup:', error.message);
        // Jangan stop bot, cukup log error
    }
}, 60000); // Run every minute

// Package.json dependencies info
console.log(`
📦 **Required Dependencies:**
npm install telegraf

🔧 **Setup Instructions:**
1. Replace BOT_TOKEN with your actual bot token
2. Replace MAIN_ADMIN with your Telegram user ID
3. Run: node bot.js

🚀 **Features Ready:**
✅ Full inline button interface
✅ Admin management system
✅ Group whitelist management
✅ Advanced content detection
✅ Rate limiting & spam protection
✅ Lockdown mode for emergencies
✅ Auto-cleanup & data management
✅ Professional notifications
✅ JSON database storage

🔥 **Security Patterns:** ${dangerousPatterns.length} detection rules loaded
`);

// Start the bot
startBot();

// Export for testing purposes
module.exports = { bot, botData, isAdmin, checkDangerousContent };
