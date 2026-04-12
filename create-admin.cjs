const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

// 连接数据库
const db = new sqlite3.Database('./database.db');

async function createAdminUser() {
  try {
    // 检查是否已存在管理员账户
    const existingAdmin = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE role = "admin"', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingAdmin) {
      console.log('管理员账户已存在:', existingAdmin.email);
      return;
    }

    // 创建默认管理员账户
    const adminEmail = 'admin@vidnotes.com';
    const adminPassword = 'admin123';
    const adminUsername = 'Administrator';

    // 加密密码
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // 插入管理员账户
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (username, email, password, role, created_at) VALUES (?, ?, ?, ?, ?)',
        [adminUsername, adminEmail, hashedPassword, 'admin', new Date().toISOString()],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    console.log('默认管理员账户创建成功!');
    console.log('邮箱:', adminEmail);
    console.log('密码:', adminPassword);
    console.log('请在生产环境中修改默认密码!');

  } catch (error) {
    console.error('创建管理员账户失败:', error);
  } finally {
    db.close();
  }
}

createAdminUser();