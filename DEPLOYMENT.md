# VidNotes 服务器部署指南

## 问题诊断结果

根据最新诊断，发现以下问题：
- ✅ 环境变量配置正确
- ✅ 数据库文件存在
- ✅ 前端构建文件存在
- ❌ **PM2未安装** - 这是主要问题
- ❌ **nginx未安装或配置错误**
- ❌ API端点无法访问

## 服务器环境要求

### 1. 安装Node.js和npm
```bash
# 检查是否已安装
node --version
npm --version

# 如果未安装，请安装Node.js 18+
```

### 2. 进程管理选择

**选项A：使用PM2（推荐）**
```bash
# 全局安装PM2
npm install -g pm2

# 验证安装
pm2 --version
```

**选项B：使用Node直接运行**
```bash
# 无需额外安装，直接使用Node
node --version
```

### 3. 安装nginx
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
# 或
sudo dnf install nginx

# 启动nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

## 部署步骤

### 1. 上传项目文件
确保以下文件已上传到服务器：
- 所有源代码文件
- `.env` 文件（包含API密钥等配置）
- `ecosystem.config.js`
- `database.db`
- `dist/` 目录（前端构建文件）

### 2. 安装依赖
```bash
cd /path/to/vidnotes
npm install
```

### 3. 构建前端（如果需要）
```bash
npm run build
```

### 4. 启动后端服务

**使用PM2启动（推荐）：**
```bash
# 使用PM2启动
pm2 start ecosystem.config.js

# 检查状态
pm2 status
pm2 logs vidnotes-api
```

**使用Node直接启动：**
```bash
# 直接启动后端服务
node api/server.js

# 或者使用npm脚本
npm run dev:server

# 后台运行（Linux/Mac）
nohup node api/server.js > logs/server.log 2>&1 &

# 后台运行（Windows）
start /B node api/server.js
```

### 5. 配置nginx反向代理

创建nginx配置文件 `/etc/nginx/sites-available/vidnotes`：

```nginx
server {
    listen 80;
    server_name vidnotes.mrgrl.com;
    
    # 前端静态文件
    location / {
        root /path/to/vidnotes/dist;
        try_files $uri $uri/ /index.html;
        index index.html;
    }
    
    # API代理
    location /api/ {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # 管理界面
    location /admin {
        proxy_pass http://localhost:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用配置：
```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/vidnotes /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启nginx
sudo systemctl restart nginx
```

### 6. 配置SSL（推荐）
```bash
# 安装certbot
sudo apt install certbot python3-certbot-nginx

# 获取SSL证书
sudo certbot --nginx -d vidnotes.mrgrl.com
```

## 环境变量配置

确保服务器上的 `.env` 文件包含：
```env
# API配置
ARK_API_KEY=your_api_key
ARK_MODEL_ID=your_model_id
PORT=3002

# 其他必要配置...
JWT_SECRET=your_jwt_secret
```

## 故障排除

### 1. 检查进程状态

**使用PM2：**
```bash
pm2 status
pm2 logs vidnotes-api
pm2 restart vidnotes-api
```

**使用Node直接运行：**
```bash
# 检查进程
ps aux | grep "node api/server.js"

# Windows检查进程
tasklist | findstr node

# 重启服务（需要先停止再启动）
# 找到进程ID后
kill <PID>  # Linux/Mac
taskkill /PID <PID> /F  # Windows

# 然后重新启动
node api/server.js
```

### 2. 检查端口占用
```bash
netstat -tulpn | grep :3002
```

### 3. 检查nginx状态
```bash
sudo systemctl status nginx
sudo nginx -t
```

### 4. 查看nginx日志
```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### 5. 测试API连接
```bash
# 测试本地API
curl http://localhost:3002/api/health

# 测试通过nginx
curl http://vidnotes.mrgrl.com/api/health
```

## 常见问题

### 502 Bad Gateway
- 检查后端服务是否运行：`pm2 status`
- 检查端口配置是否正确
- 查看nginx错误日志

### 404 Not Found
- 检查nginx配置中的路径设置
- 确保前端构建文件存在于正确位置

### 数据库连接错误
- 确保 `database.db` 文件存在
- 检查文件权限
- 运行数据库初始化脚本

## 验证部署

1. 访问 `https://vidnotes.mrgrl.com` 应该显示前端页面
2. 访问 `https://vidnotes.mrgrl.com/api/health` 应该返回健康状态
3. 尝试登录功能

## 维护命令

**使用PM2：**
```bash
# 重启服务
pm2 restart vidnotes-api

# 查看日志
pm2 logs vidnotes-api --lines 100

# 更新代码后重新部署
git pull
npm install
npm run build
pm2 restart vidnotes-api
```

**使用Node直接运行：**
```bash
# 停止服务
kill <PID>  # 或 Ctrl+C 如果在前台运行

# 更新代码
git pull
npm install
npm run build

# 重新启动
node api/server.js
# 或后台运行
nohup node api/server.js > logs/server.log 2>&1 &
```

---

**重要提醒**：请确保在服务器上按顺序执行以上步骤，特别是安装PM2和nginx这两个关键组件。