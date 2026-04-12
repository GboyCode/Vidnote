const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./database.db');

async function resetPassword() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.log('请提供邮箱和新密码！\n用法: node reset-password.cjs <邮箱> <新密码>');
    process.exit(1);
  }

  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      console.log(`未找到邮箱为 ${email} 的用户`);
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET password = ? WHERE email = ?',
        [hashedPassword, email],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });

    console.log(`✅ 成功重置用户 ${email} 的密码为: ${newPassword}`);
  } catch (error) {
    console.error('❌ 重置密码失败:', error);
  } finally {
    db.close();
  }
}

resetPassword();