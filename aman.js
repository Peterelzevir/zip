//
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// Bot Configuration
const BOT_TOKEN = '7566921062:AAEyph6icSScdJTuYXhvJnWLFuRruF0VNDg';
const IMGBB_API_KEY = 'acda84e3410cd744c9a9efeb98ebc154';
const MAIN_ADMIN_ID = '5988451717'; // ID admin utama

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Database Setup
const db = new sqlite3.Database('bot_security.db');

// Initialize Database Tables
db.serialize(() => {
    // Tabel grup yang dikelola
    db.run(`CREATE TABLE IF NOT EXISTS managed_groups (
        group_id TEXT PRIMARY KEY,
        group_name TEXT,
        added_by TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        detection_enabled INTEGER DEFAULT 1
    )`);

    // Tabel admin bot
    db.run(`CREATE TABLE IF NOT EXISTS bot_admins (
        user_id TEXT PRIMARY KEY,
        username TEXT,
        added_by TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_main_admin INTEGER DEFAULT 0
    )`);

    // Tabel log aktivitas
    db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT,
        user_id TEXT,
        username TEXT,
        action_type TEXT,
        message TEXT,
        ai_decision TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabel peringatan user
    db.run(`CREATE TABLE IF NOT EXISTS user_warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT,
        user_id TEXT,
        username TEXT,
        warning_count INTEGER DEFAULT 0,
        last_warning DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabel statistik harian
    db.run(`CREATE TABLE IF NOT EXISTS daily_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        total_messages INTEGER DEFAULT 0,
        warnings_given INTEGER DEFAULT 0,
        users_banned INTEGER DEFAULT 0,
        messages_deleted INTEGER DEFAULT 0,
        suspicious_images INTEGER DEFAULT 0
    )`);

    // Insert main admin
    db.run(`INSERT OR IGNORE INTO bot_admins (user_id, username, is_main_admin) VALUES (?, 'main_admin', 1)`, [MAIN_ADMIN_ID]);
});

// AI Analysis Functions
async function analyzeMessage(text, groupId, imageUrl = null) {
    try {
        const customPrompt = `Kamu adalah AI Security Bot yang mengontrol keamanan grup Telegram. Analisis pesan berikut dan berikan keputusan dalam format JSON:

TUGAS UTAMA:
- Deteksi konten SARA, 18+, spam, toxic, hate speech
- Deteksi gambar yang tidak pantas atau mencurigakan
- Berikan keputusan tegas untuk menjaga keamanan grup

KEPUTUSAN YANG BISA DIAMBIL:
1. "safe" - Pesan aman, tidak perlu tindakan
2. "warning" - Beri peringatan kepada user
3. "delete" - Hapus pesan
4. "delete_warn" - Hapus pesan dan beri peringatan
5. "restrict" - Batasi user (mute) selama waktu tertentu
6. "ban" - Keluarkan user dari grup

FORMAT RESPONSE WAJIB JSON:
{
    "decision": "safe/warning/delete/delete_warn/restrict/ban",
    "reason": "alasan keputusan",
    "severity": 1-10,
    "restrict_duration": "waktu pembatasan jika restrict (contoh: 1h, 24h, 7d)",
    "warning_message": "pesan peringatan untuk user"
}

PESAN YANG DIANALISIS: ${text}`;

        let apiUrl = `https://api.ryzumi.vip/api/ai/v2/chatgpt?text=${encodeURIComponent(customPrompt)}&session=security_${groupId}`;
        
        if (imageUrl) {
            apiUrl += `&imageUrl=${encodeURIComponent(imageUrl)}`;
        }

        const response = await axios.get(apiUrl);
        
        if (response.data && response.data.result) {
            try {
                // Mencoba parse JSON dari response AI
                const jsonMatch = response.data.result.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
            } catch (e) {
                console.log('JSON parse error, using fallback');
            }
            
            // Fallback analysis based on keywords
            return analyzeFallback(text, response.data.result);
        }
        
        return { decision: "safe", reason: "No analysis available", severity: 1 };
    } catch (error) {
        console.error('AI Analysis Error:', error);
        return analyzeFallback(text);
    }
}

function analyzeFallback(text, aiResponse = '') {
    const suspiciousWords = ['anjing', 'babi', 'kontol', 'memek', 'bangsat', 'tolol', 'goblok'];
    const saraWords = ['china', 'cina', 'pribumi', 'kafir', 'kristen', 'islam', 'hindu', 'budha'];
    
    const lowerText = text.toLowerCase();
    let severity = 1;
    let decision = "safe";
    let reason = "Pesan terlihat aman";

    // Check for suspicious words
    for (let word of suspiciousWords) {
        if (lowerText.includes(word)) {
            severity = Math.min(severity + 3, 10);
            decision = severity > 6 ? "ban" : severity > 4 ? "delete_warn" : "warning";
            reason = "Terdeteksi kata kasar/toxic";
            break;
        }
    }

    // Check for SARA content
    for (let word of saraWords) {
        if (lowerText.includes(word) && (lowerText.includes('benci') || lowerText.includes('bodoh') || lowerText.includes('jahat'))) {
            severity = 8;
            decision = "delete_warn";
            reason = "Terdeteksi konten SARA";
            break;
        }
    }

    // Check if AI detected something suspicious
    if (aiResponse.toLowerCase().includes('tidak pantas') || aiResponse.toLowerCase().includes('berbahaya')) {
        severity = Math.max(severity, 6);
        decision = severity > 7 ? "ban" : "delete_warn";
        reason = "AI mendeteksi konten mencurigakan";
    }

    return {
        decision,
        reason,
        severity,
        restrict_duration: "24h",
        warning_message: `⚠️ Peringatan: ${reason}. Harap jaga perilaku di grup ini.`
    };
}

// Image Upload to ImgBB
async function uploadToImgBB(imagePath) {
    try {
        const form = new FormData();
        form.append('image', fs.createReadStream(imagePath));

        const response = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, form, {
            headers: form.getHeaders()
        });

        if (response.data.success) {
            return response.data.data.url;
        }
        throw new Error('Upload failed');
    } catch (error) {
        console.error('ImgBB Upload Error:', error);
        return null;
    }
}

// Database Helper Functions
function isAdmin(userId) {
    return new Promise((resolve) => {
        db.get(`SELECT * FROM bot_admins WHERE user_id = ?`, [userId], (err, row) => {
            resolve(!!row);
        });
    });
}

function isGroupManaged(groupId) {
    return new Promise((resolve) => {
        db.get(`SELECT * FROM managed_groups WHERE group_id = ?`, [groupId], (err, row) => {
            resolve(!!row);
        });
    });
}

function isDetectionEnabled(groupId) {
    return new Promise((resolve) => {
        db.get(`SELECT detection_enabled FROM managed_groups WHERE group_id = ?`, [groupId], (err, row) => {
            resolve(row ? !!row.detection_enabled : false);
        });
    });
}

function addWarning(groupId, userId, username) {
    return new Promise((resolve) => {
        db.run(`INSERT OR REPLACE INTO user_warnings (group_id, user_id, username, warning_count, last_warning) 
                VALUES (?, ?, ?, COALESCE((SELECT warning_count FROM user_warnings WHERE group_id = ? AND user_id = ?), 0) + 1, CURRENT_TIMESTAMP)`,
                [groupId, userId, username, groupId, userId], function(err) {
            if (!err) {
                db.get(`SELECT warning_count FROM user_warnings WHERE group_id = ? AND user_id = ?`, 
                       [groupId, userId], (err, row) => {
                    resolve(row ? row.warning_count : 1);
                });
            } else {
                resolve(1);
            }
        });
    });
}

function logActivity(groupId, userId, username, actionType, message, aiDecision) {
    db.run(`INSERT INTO activity_logs (group_id, user_id, username, action_type, message, ai_decision) 
            VALUES (?, ?, ?, ?, ?, ?)`, 
            [groupId, userId, username, actionType, message, JSON.stringify(aiDecision)]);
}

function updateDailyStats(type) {
    const today = new Date().toISOString().split('T')[0];
    
    db.run(`INSERT OR IGNORE INTO daily_stats (date) VALUES (?)`, [today]);
    
    let column = '';
    switch(type) {
        case 'message': column = 'total_messages'; break;
        case 'warning': column = 'warnings_given'; break;
        case 'ban': column = 'users_banned'; break;
        case 'delete': column = 'messages_deleted'; break;
        case 'image': column = 'suspicious_images'; break;
    }
    
    if (column) {
        db.run(`UPDATE daily_stats SET ${column} = ${column} + 1 WHERE date = ?`, [today]);
    }
}

// Execute AI Decision
async function executeDecision(chatId, messageId, userId, username, decision) {
    try {
        switch(decision.decision) {
            case 'warning':
                await bot.sendMessage(chatId, `⚠️ @${username} ${decision.warning_message}`, {
                    reply_to_message_id: messageId
                });
                await addWarning(chatId, userId, username);
                updateDailyStats('warning');
                break;

            case 'delete':
                await bot.deleteMessage(chatId, messageId);
                updateDailyStats('delete');
                break;

            case 'delete_warn':
                await bot.deleteMessage(chatId, messageId);
                await bot.sendMessage(chatId, `🚫 Pesan dari @${username} telah dihapus. ${decision.warning_message}`);
                await addWarning(chatId, userId, username);
                updateDailyStats('delete');
                updateDailyStats('warning');
                break;

            case 'restrict':
                const restrictDuration = parseDuration(decision.restrict_duration || '24h');
                await bot.restrictChatMember(chatId, userId, {
                    until_date: Math.floor(Date.now() / 1000) + restrictDuration,
                    can_send_messages: false
                });
                await bot.sendMessage(chatId, `🔇 @${username} telah dibatasi selama ${decision.restrict_duration}. Alasan: ${decision.reason}`);
                updateDailyStats('warning');
                break;

            case 'ban':
                await bot.banChatMember(chatId, userId);
                await bot.sendMessage(chatId, `🔨 @${username} telah dikeluarkan dari grup. Alasan: ${decision.reason}`);
                updateDailyStats('ban');
                break;
        }
    } catch (error) {
        console.error('Execute Decision Error:', error);
    }
}

function parseDuration(duration) {
    const match = duration.match(/(\d+)([hd])/);
    if (!match) return 86400; // default 24 hours
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    return unit === 'h' ? value * 3600 : value * 86400;
}

// Message Handler
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    const messageId = msg.message_id;

    // Skip if not a group chat
    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
        return;
    }

    // Check if group is managed
    const isManaged = await isGroupManaged(chatId);
    if (!isManaged) {
        return;
    }

    // Check if detection is enabled
    const detectionEnabled = await isDetectionEnabled(chatId);
    if (!detectionEnabled) {
        return;
    }

    updateDailyStats('message');

    let text = msg.text || msg.caption || '';
    let imageUrl = null;

    // Handle images
    if (msg.photo) {
        try {
            const photo = msg.photo[msg.photo.length - 1];
            const file = await bot.getFile(photo.file_id);
            const filePath = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
            
            // Download and upload to ImgBB
            const response = await axios.get(filePath, { responseType: 'stream' });
            const tempPath = path.join(__dirname, 'temp_image.jpg');
            const writer = fs.createWriteStream(tempPath);
            
            response.data.pipe(writer);
            
            writer.on('finish', async () => {
                imageUrl = await uploadToImgBB(tempPath);
                fs.unlinkSync(tempPath); // Clean up temp file
                
                if (imageUrl) {
                    updateDailyStats('image');
                    const decision = await analyzeMessage(text, chatId, imageUrl);
                    logActivity(chatId, userId, username, 'image_analysis', text, decision);
                    
                    if (decision.decision !== 'safe') {
                        await executeDecision(chatId, messageId, userId, username, decision);
                    }
                }
            });
        } catch (error) {
            console.error('Image processing error:', error);
        }
    }
    
    // Handle text messages
    if (text && !imageUrl) {
        const decision = await analyzeMessage(text, chatId);
        logActivity(chatId, userId, username, 'text_analysis', text, decision);
        
        if (decision.decision !== 'safe') {
            await executeDecision(chatId, messageId, userId, username, decision);
        }
    }
});

// New Chat Member Handler
bot.on('new_chat_members', async (msg) => {
    const chatId = msg.chat.id;
    const newMembers = msg.new_chat_members;

    for (let member of newMembers) {
        if (member.id === bot.options.polling.params.offset) { // Bot itself
            const invitedBy = msg.from.id;
            const isAdminUser = await isAdmin(invitedBy);
            const isManaged = await isGroupManaged(chatId);

            if (!isAdminUser || !isManaged) {
                await bot.sendMessage(chatId, `❌ Maaf, bot ini hanya bisa digunakan di grup yang telah terdaftar. Silakan hubungi admin bot untuk mendapatkan akses.`);
                await bot.leaveChat(chatId);
                return;
            }

            // Check if bot is admin in the group
            try {
                const chatMember = await bot.getChatMember(chatId, bot.options.polling.params.offset);
                if (chatMember.status !== 'administrator') {
                    await bot.sendMessage(chatId, `⚠️ Bot telah ditambahkan ke grup, tetapi untuk bekerja maksimal, bot perlu dijadikan admin grup ini.`);
                } else {
                    await bot.sendMessage(chatId, `✅ Bot Security berhasil diaktifkan! Bot akan memonitor grup ini untuk menjaga keamanan.`);
                }
            } catch (error) {
                console.error('Check admin status error:', error);
            }
        }
    }
});

// Inline Keyboard
const adminKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '➕ Tambah Grup', callback_data: 'add_group' },
                { text: '➖ Del Grup', callback_data: 'del_group' }
            ],
            [
                { text: '🟢 Deteksi ON', callback_data: 'detection_on' },
                { text: '🔴 Deteksi OFF', callback_data: 'detection_off' }
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
    }
};

// Start Command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (await isAdmin(userId)) {
        await bot.sendMessage(chatId, `🤖 <b>Bot Security Admin Panel</b>

Selamat datang di panel admin bot keamanan grup!

<b>Fitur Utama:</b>
• AI Analysis untuk deteksi konten berbahaya
• Auto moderation dengan berbagai tingkat sanksi
• Monitoring real-time aktivitas grup
• Laporan statistik harian
• Multi-admin management

Gunakan tombol di bawah untuk mengelola bot:`, 
        { parse_mode: 'HTML', ...adminKeyboard });
    } else {
        await bot.sendMessage(chatId, `❌ Anda tidak memiliki akses ke bot ini. Hubungi admin untuk mendapatkan akses.`);
    }
});

// Callback Query Handler
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    if (!(await isAdmin(userId))) {
        await bot.answerCallbackQuery(query.id, 'Anda tidak memiliki akses!');
        return;
    }

    switch(data) {
        case 'add_group':
            await bot.sendMessage(chatId, `📝 Untuk menambah grup, silakan:
1. Tambahkan bot ke grup yang ingin dikelola
2. Jadikan bot sebagai admin grup
3. Bot akan otomatis terdaftar jika Anda adalah admin bot`);
            break;

        case 'del_group':
            await bot.sendMessage(chatId, `📝 Kirim command: /delgroup [GROUP_ID]
Contoh: /delgroup -1001234567890

Untuk melihat daftar grup, gunakan tombol "List Grup"`);
            break;

        case 'detection_on':
            await bot.sendMessage(chatId, `📝 Kirim command: /detection_on [GROUP_ID]
Contoh: /detection_on -1001234567890

Untuk mengaktifkan deteksi di semua grup: /detection_on all`);
            break;

        case 'detection_off':
            await bot.sendMessage(chatId, `📝 Kirim command: /detection_off [GROUP_ID]
Contoh: /detection_off -1001234567890

Untuk menonaktifkan deteksi di semua grup: /detection_off all`);
            break;

        case 'list_groups':
            db.all(`SELECT * FROM managed_groups ORDER BY added_at DESC`, [], (err, rows) => {
                if (err || rows.length === 0) {
                    bot.sendMessage(chatId, '📋 Tidak ada grup yang dikelola.');
                    return;
                }

                let message = '📋 <b>Daftar Grup Dikelola:</b>\n\n';
                rows.forEach((row, index) => {
                    const status = row.detection_enabled ? '🟢' : '🔴';
                    message += `${index + 1}. ${status} <b>${row.group_name}</b>\n`;
                    message += `   ID: <code>${row.group_id}</code>\n`;
                    message += `   Ditambahkan: ${row.added_at}\n\n`;
                });

                bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            });
            break;

        case 'add_admin':
            await bot.sendMessage(chatId, `📝 Kirim command: /addadmin [USER_ID] [USERNAME]
Contoh: /addadmin 123456789 john_doe`);
            break;

        case 'del_admin':
            await bot.sendMessage(chatId, `📝 Kirim command: /deladmin [USER_ID]
Contoh: /deladmin 123456789

⚠️ Admin utama tidak bisa dihapus!`);
            break;

        case 'statistics':
            const today = new Date().toISOString().split('T')[0];
            db.get(`SELECT * FROM daily_stats WHERE date = ?`, [today], (err, todayStats) => {
                db.all(`SELECT COUNT(*) as total_groups FROM managed_groups`, [], (err, groupCount) => {
                    db.all(`SELECT COUNT(*) as total_admins FROM bot_admins`, [], (err, adminCount) => {
                        db.all(`SELECT COUNT(*) as total_logs FROM activity_logs WHERE date(timestamp) = ?`, [today], (err, logCount) => {
                            
                            const stats = todayStats || {
                                total_messages: 0,
                                warnings_given: 0,
                                users_banned: 0,
                                messages_deleted: 0,
                                suspicious_images: 0
                            };

                            const message = `📊 <b>Statistik Bot Security</b>

<b>📅 Hari Ini (${today}):</b>
💬 Total Pesan: ${stats.total_messages}
⚠️ Peringatan Diberikan: ${stats.warnings_given}
🔨 User Dikeluarkan: ${stats.users_banned}
🗑️ Pesan Dihapus: ${stats.messages_deleted}
🖼️ Gambar Dianalisis: ${stats.suspicious_images}

<b>🎯 Status Bot:</b>
📱 Grup Dikelola: ${groupCount[0].total_groups}
👥 Total Admin: ${adminCount[0].total_admins}
📝 Log Aktivitas Hari Ini: ${logCount[0].total_logs}

<b>🔄 Status:</b> ✅ Aktif & Berjalan`;

                            bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
                        });
                    });
                });
            });
            break;
    }

    await bot.answerCallbackQuery(query.id);
});

// Admin Commands
bot.onText(/\/addadmin (\d+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const adminId = msg.from.id;
    const newAdminId = match[1];
    const newAdminUsername = match[2];

    if (!(await isAdmin(adminId))) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
        return;
    }

    db.run(`INSERT OR IGNORE INTO bot_admins (user_id, username, added_by) VALUES (?, ?, ?)`,
           [newAdminId, newAdminUsername, adminId], function(err) {
        if (err) {
            bot.sendMessage(chatId, '❌ Gagal menambahkan admin!');
        } else if (this.changes === 0) {
            bot.sendMessage(chatId, '⚠️ User sudah menjadi admin!');
        } else {
            bot.sendMessage(chatId, `✅ Admin baru berhasil ditambahkan: @${newAdminUsername} (${newAdminId})`);
        }
    });
});

bot.onText(/\/deladmin (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const adminId = msg.from.id;
    const targetAdminId = match[1];

    if (!(await isAdmin(adminId))) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
        return;
    }

    if (targetAdminId === MAIN_ADMIN_ID) {
        await bot.sendMessage(chatId, '❌ Admin utama tidak bisa dihapus!');
        return;
    }

    db.run(`DELETE FROM bot_admins WHERE user_id = ? AND is_main_admin = 0`, [targetAdminId], function(err) {
        if (err) {
            bot.sendMessage(chatId, '❌ Gagal menghapus admin!');
        } else if (this.changes === 0) {
            bot.sendMessage(chatId, '⚠️ Admin tidak ditemukan atau tidak bisa dihapus!');
        } else {
            bot.sendMessage(chatId, `✅ Admin berhasil dihapus: ${targetAdminId}`);
        }
    });
});

bot.onText(/\/delgroup (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const adminId = msg.from.id;
    const groupId = match[1];

    if (!(await isAdmin(adminId))) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
        return;
    }

    // First, check if group exists in database
    db.get(`SELECT group_name FROM managed_groups WHERE group_id = ?`, [groupId], async (err, row) => {
        if (err) {
            bot.sendMessage(chatId, '❌ Gagal mengecek grup!');
            return;
        }
        
        if (!row) {
            bot.sendMessage(chatId, '⚠️ Grup tidak ditemukan dalam daftar kelola!');
            return;
        }

        const groupName = row.group_name;

        // Delete from database
        db.run(`DELETE FROM managed_groups WHERE group_id = ?`, [groupId], async function(err) {
            if (err) {
                bot.sendMessage(chatId, '❌ Gagal menghapus grup dari database!');
                return;
            }

            try {
                // Send goodbye message to the group
                await bot.sendMessage(groupId, `👋 <b>Bot Security Keluar</b>

Grup ini telah dihapus dari daftar kelola bot security.
Bot akan keluar dari grup dalam 10 detik.

Terima kasih telah menggunakan layanan bot security! 🤖`, 
                { parse_mode: 'HTML' });

                // Wait 10 seconds before leaving
                setTimeout(async () => {
                    try {
                        await bot.leaveChat(groupId);
                        
                        // Notify admin about successful operation
                        await bot.sendMessage(chatId, 
                            `✅ <b>Operasi Berhasil</b>\n\n` +
                            `📋 Grup: ${groupName}\n` +
                            `🆔 ID: <code>${groupId}</code>\n` +
                            `❌ Status: Dihapus dari daftar kelola\n` +
                            `🚪 Bot telah keluar dari grup`, 
                            { parse_mode: 'HTML' });

                        // Log the activity
                        logActivity(groupId, adminId, 'SYSTEM', 'group_removed', 
                                  `Group removed from managed list by admin`, {
                            decision: 'group_removed',
                            reason: 'Admin removed group from management'
                        });

                    } catch (leaveError) {
                        console.error('Error leaving group:', leaveError);
                        await bot.sendMessage(chatId, 
                            `⚠️ Grup berhasil dihapus dari daftar, tetapi bot gagal keluar dari grup.\n` +
                            `Kemungkinan bot sudah tidak ada di grup atau tidak memiliki izin untuk keluar.\n\n` +
                            `Grup: ${groupName} (${groupId})`);
                    }
                }, 10000);

                // Immediate confirmation to admin
                await bot.sendMessage(chatId, 
                    `⏳ Grup "${groupName}" berhasil dihapus dari daftar kelola.\n` +
                    `Bot akan keluar dari grup dalam 10 detik...`);

            } catch (messageError) {
                console.error('Error sending goodbye message:', messageError);
                
                // Still try to leave the group
                try {
                    await bot.leaveChat(groupId);
                    await bot.sendMessage(chatId, 
                        `✅ Grup berhasil dihapus dari daftar dan bot telah keluar.\n` +
                        `Grup: ${groupName} (${groupId})`);
                } catch (leaveError) {
                    await bot.sendMessage(chatId, 
                        `⚠️ Grup dihapus dari daftar, tetapi bot gagal keluar.\n` +
                        `Grup: ${groupName} (${groupId})`);
                }
            }
        });
    });
});

bot.onText(/\/detection_on (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const adminId = msg.from.id;
    const target = match[1];

    if (!(await isAdmin(adminId))) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
        return;
    }

    if (target === 'all') {
        db.run(`UPDATE managed_groups SET detection_enabled = 1`, [], function(err) {
            if (err) {
                bot.sendMessage(chatId, '❌ Gagal mengaktifkan deteksi!');
            } else {
                bot.sendMessage(chatId, `✅ Deteksi diaktifkan untuk semua grup (${this.changes} grup)`);
            }
        });
    } else {
        db.run(`UPDATE managed_groups SET detection_enabled = 1 WHERE group_id = ?`, [target], function(err) {
            if (err) {
                bot.sendMessage(chatId, '❌ Gagal mengaktifkan deteksi!');
            } else if (this.changes === 0) {
                bot.sendMessage(chatId, '⚠️ Grup tidak ditemukan!');
            } else {
                bot.sendMessage(chatId, `✅ Deteksi diaktifkan untuk grup: ${target}`);
            }
        });
    }
});

bot.onText(/\/detection_off (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const adminId = msg.from.id;
    const target = match[1];

    if (!(await isAdmin(adminId))) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
        return;
    }

    if (target === 'all') {
        db.run(`UPDATE managed_groups SET detection_enabled = 0`, [], function(err) {
            if (err) {
                bot.sendMessage(chatId, '❌ Gagal menonaktifkan deteksi!');
            } else {
                bot.sendMessage(chatId, `✅ Deteksi dinonaktifkan untuk semua grup (${this.changes} grup)`);
            }
        });
    } else {
        db.run(`UPDATE managed_groups SET detection_enabled = 0 WHERE group_id = ?`, [target], function(err) {
            if (err) {
                bot.sendMessage(chatId, '❌ Gagal menonaktifkan deteksi!');
            } else if (this.changes === 0) {
                bot.sendMessage(chatId, '⚠️ Grup tidak ditemukan!');
            } else {
                bot.sendMessage(chatId, `✅ Deteksi dinonaktifkan untuk grup: ${target}`);
            }
        });
    }
});

// Lanjutan dari kode sebelumnya...

// Auto-register group when bot is added by admin
bot.on('new_chat_members', async (msg) => {
    const chatId = msg.chat.id;
    const groupName = msg.chat.title;
    const addedBy = msg.from.id;

    for (let member of msg.new_chat_members) {
        if (member.is_bot && member.username === (await bot.getMe()).username) {
            if (await isAdmin(addedBy)) {
                // Auto-register the group
                db.run(`INSERT OR IGNORE INTO managed_groups (group_id, group_name, added_by) VALUES (?, ?, ?)`,
                       [chatId, groupName, addedBy], function(err) {
                    if (!err && this.changes > 0) {
                        bot.sendMessage(chatId, `✅ Grup berhasil ditambahkan ke daftar kelola bot security!`);
                    }
                });
            }
        }
    }
});

// Daily Report Function
async function generateDailyReport() {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    return new Promise((resolve) => {
        db.get(`SELECT * FROM daily_stats WHERE date = ?`, [yesterday], (err, stats) => {
            if (!stats) {
                resolve(`📊 <b>Laporan Harian Bot Security</b>
📅 Tanggal: ${yesterday}

❌ Tidak ada aktivitas tercatat untuk hari kemarin.`);
                return;
            }

            // Get top active groups
            db.all(`SELECT group_id, COUNT(*) as activity_count FROM activity_logs 
                    WHERE date(timestamp) = ? GROUP BY group_id ORDER BY activity_count DESC LIMIT 5`,
                    [yesterday], (err, topGroups) => {
                
                // Get suspicious users
                db.all(`SELECT user_id, username, COUNT(*) as violation_count FROM activity_logs 
                        WHERE date(timestamp) = ? AND ai_decision NOT LIKE '%"decision":"safe"%' 
                        GROUP BY user_id ORDER BY violation_count DESC LIMIT 5`,
                        [yesterday], (err, suspiciousUsers) => {

                    let report = `📊 <b>Laporan Harian Bot Security</b>
📅 Tanggal: ${yesterday}

<b>📈 Statistik Aktivitas:</b>
💬 Total Pesan Diproses: ${stats.total_messages}
⚠️ Peringatan Diberikan: ${stats.warnings_given}
🔨 User Dikeluarkan: ${stats.users_banned}
🗑️ Pesan Dihapus: ${stats.messages_deleted}
🖼️ Gambar Dianalisis: ${stats.suspicious_images}

<b>🏆 Grup Paling Aktif:</b>`;

                    if (topGroups && topGroups.length > 0) {
                        topGroups.forEach((group, index) => {
                            report += `\n${index + 1}. Group ${group.group_id} (${group.activity_count} aktivitas)`;
                        });
                    } else {
                        report += '\nTidak ada aktivitas grup.';
                    }

                    report += '\n\n<b>⚠️ User Mencurigakan:</b>';
                    if (suspiciousUsers && suspiciousUsers.length > 0) {
                        suspiciousUsers.forEach((user, index) => {
                            report += `\n${index + 1}. @${user.username || 'Unknown'} (${user.violation_count} pelanggaran)`;
                        });
                    } else {
                        report += '\nTidak ada user mencurigakan.';
                    }

                    report += `\n\n<b>🔒 Tingkat Keamanan:</b> `;
                    const totalViolations = stats.warnings_given + stats.users_banned + stats.messages_deleted;
                    if (totalViolations === 0) {
                        report += '🟢 AMAN';
                    } else if (totalViolations < 10) {
                        report += '🟡 WASPADA';
                    } else {
                        report += '🔴 TINGGI';
                    }

                    report += `\n\n<i>Bot Security aktif 24/7 menjaga keamanan grup Anda.</i>`;
                    resolve(report);
                });
            });
        });
    });
}

// Send daily report to all admins
async function sendDailyReportToAdmins() {
    const report = await generateDailyReport();
    
    db.all(`SELECT user_id FROM bot_admins`, [], (err, admins) => {
        if (!err && admins) {
            admins.forEach(admin => {
                bot.sendMessage(admin.user_id, report, { parse_mode: 'HTML' })
                    .catch(err => console.log(`Failed to send report to admin ${admin.user_id}:`, err));
            });
        }
    });
}

// Schedule daily report at 8 AM
cron.schedule('0 8 * * *', () => {
    console.log('Sending daily report...');
    sendDailyReportToAdmins();
}, {
    timezone: "Asia/Jakarta"
});

// Manual report command
bot.onText(/\/report/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!(await isAdmin(userId))) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
        return;
    }

    const report = await generateDailyReport();
    await bot.sendMessage(chatId, report, { parse_mode: 'HTML' });
});

// Advanced Security Features
bot.onText(/\/security_check/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!(await isAdmin(userId))) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
        return;
    }

    // Check recent suspicious activities
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    db.all(`SELECT * FROM activity_logs WHERE date(timestamp) >= ? AND ai_decision NOT LIKE '%"decision":"safe"%' ORDER BY timestamp DESC LIMIT 20`,
           [yesterday], (err, recentActivities) => {
        
        if (!recentActivities || recentActivities.length === 0) {
            bot.sendMessage(chatId, '✅ Tidak ada aktivitas mencurigakan dalam 24 jam terakhir.');
            return;
        }

        let message = `🔍 <b>Pemeriksaan Keamanan 24 Jam Terakhir</b>\n\n`;
        message += `⚠️ Ditemukan ${recentActivities.length} aktivitas mencurigakan:\n\n`;

        recentActivities.forEach((activity, index) => {
            const decision = JSON.parse(activity.ai_decision);
            message += `${index + 1}. <b>@${activity.username}</b>\n`;
            message += `   📝 Pesan: "${activity.message.substring(0, 50)}..."\n`;
            message += `   🎯 Keputusan: ${decision.decision}\n`;
            message += `   📅 Waktu: ${activity.timestamp}\n\n`;
        });

        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    });
});

// Group health check
bot.onText(/\/group_health (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const groupId = match[1];

    if (!(await isAdmin(userId))) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
        return;
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    // Get group statistics for the last 7 days
    db.all(`SELECT 
                COUNT(*) as total_activities,
                COUNT(CASE WHEN ai_decision NOT LIKE '%"decision":"safe"%' THEN 1 END) as violations,
                COUNT(DISTINCT user_id) as active_users
            FROM activity_logs 
            WHERE group_id = ? AND date(timestamp) >= ?`,
           [groupId, sevenDaysAgo], (err, stats) => {
        
        if (err || !stats[0]) {
            bot.sendMessage(chatId, '❌ Gagal mendapatkan statistik grup.');
            return;
        }

        const stat = stats[0];
        const violationRate = stat.total_activities > 0 ? (stat.violations / stat.total_activities * 100).toFixed(2) : 0;

        // Get most active users
        db.all(`SELECT user_id, username, COUNT(*) as message_count
                FROM activity_logs 
                WHERE group_id = ? AND date(timestamp) >= ?
                GROUP BY user_id 
                ORDER BY message_count DESC LIMIT 5`,
               [groupId, sevenDaysAgo], (err, activeUsers) => {

            // Get top violators
            db.all(`SELECT user_id, username, COUNT(*) as violation_count
                    FROM activity_logs 
                    WHERE group_id = ? AND date(timestamp) >= ? AND ai_decision NOT LIKE '%"decision":"safe"%'
                    GROUP BY user_id 
                    ORDER BY violation_count DESC LIMIT 5`,
                   [groupId, sevenDaysAgo], (err, violators) => {

                let healthReport = `🏥 <b>Laporan Kesehatan Grup</b>
📊 ID Grup: <code>${groupId}</code>
📅 Periode: 7 hari terakhir

<b>📈 Statistik Umum:</b>
💬 Total Aktivitas: ${stat.total_activities}
👥 User Aktif: ${stat.active_users}
⚠️ Pelanggaran: ${stat.violations}
📊 Tingkat Pelanggaran: ${violationRate}%

<b>🏆 User Paling Aktif:</b>`;

                if (activeUsers && activeUsers.length > 0) {
                    activeUsers.forEach((user, index) => {
                        healthReport += `\n${index + 1}. @${user.username || 'Unknown'} (${user.message_count} pesan)`;
                    });
                } else {
                    healthReport += '\nTidak ada data user aktif.';
                }

                healthReport += '\n\n<b>⚠️ Top Violators:</b>';
                if (violators && violators.length > 0) {
                    violators.forEach((user, index) => {
                        healthReport += `\n${index + 1}. @${user.username || 'Unknown'} (${user.violation_count} pelanggaran)`;
                    });
                } else {
                    healthReport += '\nTidak ada pelanggaran tercatat.';
                }

                // Health status
                healthReport += '\n\n<b>🏥 Status Kesehatan Grup:</b> ';
                if (violationRate < 5) {
                    healthReport += '🟢 SEHAT';
                } else if (violationRate < 15) {
                    healthReport += '🟡 PERLU PERHATIAN';
                } else {
                    healthReport += '🔴 TIDAK SEHAT';
                }

                bot.sendMessage(chatId, healthReport, { parse_mode: 'HTML' });
            });
        });
    });
});

// Emergency lockdown command
bot.onText(/\/lockdown (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const groupId = match[1];

    if (!(await isAdmin(userId))) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
        return;
    }

    try {
        // Set group permissions to restrict all members
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

        await bot.sendMessage(groupId, `🚨 <b>LOCKDOWN DIAKTIFKAN</b>

Grup telah dikunci sementara karena aktivitas mencurigakan.
Hanya admin yang dapat mengirim pesan.

Hubungi admin untuk informasi lebih lanjut.`, { parse_mode: 'HTML' });

        await bot.sendMessage(chatId, `✅ Lockdown berhasil diaktifkan untuk grup ${groupId}`);
        
        // Log lockdown activity
        logActivity(groupId, userId, 'SYSTEM', 'lockdown_activated', 'Emergency lockdown activated', {
            decision: 'lockdown',
            reason: 'Emergency lockdown by admin'
        });

    } catch (error) {
        console.error('Lockdown error:', error);
        await bot.sendMessage(chatId, `❌ Gagal mengaktifkan lockdown. Pastikan bot adalah admin di grup tersebut.`);
    }
});

// Unlock group command
bot.onText(/\/unlock (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const groupId = match[1];

    if (!(await isAdmin(userId))) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
        return;
    }

    try {
        // Restore normal group permissions
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

        await bot.sendMessage(groupId, `✅ <b>LOCKDOWN DINONAKTIFKAN</b>

Grup telah dibuka kembali.
Silakan melanjutkan aktivitas normal.

Harap tetap menjaga etika dan aturan grup.`, { parse_mode: 'HTML' });

        await bot.sendMessage(chatId, `✅ Lockdown berhasil dinonaktifkan untuk grup ${groupId}`);
        
        // Log unlock activity
        logActivity(groupId, userId, 'SYSTEM', 'lockdown_deactivated', 'Lockdown deactivated', {
            decision: 'unlock',
            reason: 'Lockdown deactivated by admin'
        });

    } catch (error) {
        console.error('Unlock error:', error);
        await bot.sendMessage(chatId, `❌ Gagal menonaktifkan lockdown. Pastikan bot adalah admin di grup tersebut.`);
    }
});

// Bulk user management
bot.onText(/\/ban_multiple (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userIds = match[1].split(',').map(id => id.trim());

    if (!(await isAdmin(userId))) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
        return;
    }

    await bot.sendMessage(chatId, `📝 Kirim grup ID dimana user akan di-ban:
Format: /execute_ban [GROUP_ID]
User yang akan di-ban: ${userIds.join(', ')}`);

    // Store user IDs for the next command
    // Note: In production, you might want to use a more persistent storage
    global.pendingBans = { adminId: userId, userIds: userIds };
});

bot.onText(/\/execute_ban (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const groupId = match[1];

    if (!(await isAdmin(userId)) || !global.pendingBans || global.pendingBans.adminId !== userId) {
        await bot.sendMessage(chatId, '❌ Tidak ada operasi ban yang pending!');
        return;
    }

    const userIds = global.pendingBans.userIds;
    let successCount = 0;
    let failCount = 0;

    for (let targetUserId of userIds) {
        try {
            await bot.banChatMember(groupId, targetUserId);
            successCount++;
            
            // Log ban activity
            logActivity(groupId, targetUserId, 'UNKNOWN', 'bulk_ban', 'Bulk ban operation', {
                decision: 'ban',
                reason: 'Bulk ban by admin'
            });
            
            await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
        } catch (error) {
            console.error(`Failed to ban user ${targetUserId}:`, error);
            failCount++;
        }
    }

    await bot.sendMessage(chatId, `✅ Operasi bulk ban selesai:
- Berhasil: ${successCount} user
- Gagal: ${failCount} user`);

    // Clear pending bans
    delete global.pendingBans;
    updateDailyStats('ban');
});

// Advanced word filter management
const wordFilters = new Map();

bot.onText(/\/add_filter (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const groupId = match[1];
    const word = match[2].toLowerCase();

    if (!(await isAdmin(userId))) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
        return;
    }

    if (!wordFilters.has(groupId)) {
        wordFilters.set(groupId, new Set());
    }
    
    wordFilters.get(groupId).add(word);
    await bot.sendMessage(chatId, `✅ Filter kata ditambahkan: "${word}" untuk grup ${groupId}`);
});

bot.onText(/\/remove_filter (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const groupId = match[1];
    const word = match[2].toLowerCase();

    if (!(await isAdmin(userId))) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
        return;
    }

    if (wordFilters.has(groupId)) {
        wordFilters.get(groupId).delete(word);
        await bot.sendMessage(chatId, `✅ Filter kata dihapus: "${word}" dari grup ${groupId}`);
    }
});

// Enhanced message analysis with custom filters
async function enhancedAnalyzeMessage(text, groupId, imageUrl = null) {
    // Check custom word filters first
    if (wordFilters.has(groupId)) {
        const filters = wordFilters.get(groupId);
        const lowerText = text.toLowerCase();
        
        for (let word of filters) {
            if (lowerText.includes(word)) {
                return {
                    decision: "delete_warn",
                    reason: `Terdeteksi kata terfilter: ${word}`,
                    severity: 7,
                    restrict_duration: "24h",
                    warning_message: `⚠️ Pesan mengandung kata yang difilter: "${word}"`
                };
            }
        }
    }

    // Use original AI analysis
    return await analyzeMessage(text, groupId, imageUrl);
}

// Help command for admins
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!(await isAdmin(userId))) {
        await bot.sendMessage(chatId, '❌ Anda tidak memiliki akses!');
        return;
    }

    const helpMessage = `🤖 <b>Bot Security - Panduan Admin</b>

<b>📋 Command Utama:</b>
/start - Panel admin utama
/help - Panduan ini
/report - Laporan harian manual

<b>👥 Manajemen Admin:</b>
/addadmin [USER_ID] [USERNAME] - Tambah admin
/deladmin [USER_ID] - Hapus admin

<b>🏢 Manajemen Grup:</b>
/delgroup [GROUP_ID] - Hapus grup dari kelola
/detection_on [GROUP_ID/all] - Aktifkan deteksi
/detection_off [GROUP_ID/all] - Nonaktifkan deteksi

<b>🔒 Keamanan Lanjutan:</b>
/security_check - Cek aktivitas mencurigakan
/group_health [GROUP_ID] - Laporan kesehatan grup
/lockdown [GROUP_ID] - Kunci grup darurat
/unlock [GROUP_ID] - Buka kunci grup

<b>🛡️ Filter Kata:</b>
/add_filter [GROUP_ID] [KATA] - Tambah filter
/remove_filter [GROUP_ID] [KATA] - Hapus filter

<b>👨‍⚖️ Manajemen User:</b>
/ban_multiple [USER_ID1,USER_ID2,...] - Ban multiple user
/execute_ban [GROUP_ID] - Eksekusi ban

<b>🎯 Fitur Otomatis:</b>
• AI Analysis untuk setiap pesan
• Auto-moderation berdasarkan tingkat ancaman
• Laporan harian otomatis (jam 8 pagi)
• Deteksi gambar tidak pantas
• System peringatan bertingkat

<b>📞 Support:</b>
Bot ini aktif 24/7 dan akan otomatis mengambil tindakan berdasarkan analisis AI yang canggih.`;

    await bot.sendMessage(chatId, helpMessage, { parse_mode: 'HTML' });
});

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

bot.on('error', (error) => {
    console.error('Bot error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down bot...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});

// Start message
console.log('🤖 Bot Security started successfully!');
console.log('📊 Database initialized');
console.log('🔄 Daily reports scheduled');
console.log('🛡️ AI Security monitoring active');

// Package.json requirements
/*
{
  "name": "telegram-security-bot",
  "version": "1.0.0",
  "description": "Advanced Telegram Security Bot with AI Analysis",
  "main": "bot.js",
  "scripts": {
    "start": "node bot.js",
    "dev": "nodemon bot.js"
  },
  "dependencies": {
    "node-telegram-bot-api": "^0.61.0",
    "sqlite3": "^5.1.6",
    "axios": "^1.4.0",
    "form-data": "^4.0.0",
    "node-cron": "^3.0.2",
    "fs": "^0.0.1-security",
    "path": "^0.12.7"
  },
  "keywords": ["telegram", "bot", "security", "ai", "moderation"],
  "author": "Your Name",
  "license": "MIT"
}
*/

// Installation instructions:
/*
1. npm install
2. Buat bot baru di @BotFather dan dapatkan token
3. Dapatkan API key dari ImgBB.com
4. Ganti variabel BOT_TOKEN, IMGBB_API_KEY, dan MAIN_ADMIN_ID
5. npm start
*/
