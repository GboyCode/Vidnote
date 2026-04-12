import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { promises as fsp } from 'fs';
import { spawn } from 'child_process';
import OpenAI from 'openai';
import 'dotenv/config';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import { createRequire } from 'module';
import { TosClient } from '@volcengine/tos-sdk';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import sqlite3 from 'sqlite3';
const require = createRequire(import.meta.url);

const ytDlpPath = path.join(process.cwd(), 'yt-dlp.exe');
if (fs.existsSync(ytDlpPath)) {
  console.log('已配置本地 yt-dlp.exe:', ytDlpPath);
} else {
  console.warn('未找到本地 yt-dlp.exe:', ytDlpPath);
}
// 移除了 yt-dlp 依赖，现在使用专用API方法
// import ffmpegPath from 'ffmpeg-static';

const app = express();
const PORT = process.env.PORT || 3002;

// JWT密钥
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// 数据库初始化
const db = new sqlite3.Database('./database.db');

// 创建用户表
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// JWT验证中间件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: '访问令牌缺失' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: '令牌无效' });
    }
    req.user = user;
    next();
  });
};

// 管理员权限验证中间件
const requireAdmin = (req, res, next) => {
  // 首先验证用户身份
  authenticateToken(req, res, (err) => {
    if (err) return;
    
    // 从数据库获取用户完整信息（包括角色）
    db.get('SELECT id, username, email, role FROM users WHERE id = ?', [req.user.id], (err, user) => {
      if (err) {
        console.error('数据库查询错误:', err);
        return res.status(500).json({ message: '服务器内部错误' });
      }

      if (!user) {
        return res.status(404).json({ message: '用户不存在' });
      }

      if (user.role !== 'admin') {
        return res.status(403).json({ message: '权限不足，需要管理员权限' });
      }

      // 将完整用户信息添加到请求对象
      req.user = user;
      next();
    });
  });
};

// 配置 ffmpeg 路径（优先使用 ffmpeg-static，其次 @ffmpeg-installer/ffmpeg）
let __ffmpegConfigured = false;
let __ffmpegBinaryPath = '';
try {
  const mod = await import('ffmpeg-static');
  const staticPath = (mod && (mod.default ?? mod));
  if (staticPath && fs.existsSync(staticPath)) {
    ffmpeg.setFfmpegPath(staticPath);
    __ffmpegConfigured = true;
    __ffmpegBinaryPath = staticPath;
    console.log('使用 ffmpeg-static 二进制:', staticPath);
  } else if (staticPath) {
    console.warn('检测到 ffmpeg-static，但未安装平台二进制，跳过设置路径:', staticPath);
  }
} catch {}
if (!__ffmpegConfigured) {
  try {
    const mod2 = await import('@ffmpeg-installer/ffmpeg');
    const installerPath = mod2?.path || (mod2?.default && mod2.default.path);
    if (installerPath && fs.existsSync(installerPath)) {
      ffmpeg.setFfmpegPath(installerPath);
      __ffmpegConfigured = true;
      __ffmpegBinaryPath = installerPath;
      console.log('使用 @ffmpeg-installer/ffmpeg 二进制:', installerPath);
    }
  } catch (e) {
    console.warn('未能通过 @ffmpeg-installer/ffmpeg 配置 ffmpeg：', e?.message || e);
  }
}
if (!__ffmpegConfigured) {
  console.warn('未找到可用的 ffmpeg 二进制，将尝试系统环境变量中的 ffmpeg。');
}

// 配置火山引擎豆包AI客户端（仅在有API密钥时初始化）
let client = null;
if (process.env.ARK_API_KEY) {
  client = new OpenAI({
    apiKey: process.env.ARK_API_KEY,
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  });
  console.log('豆包AI客户端配置成功');
} else {
  console.log('未配置 ARK_API_KEY，豆包AI功能将被禁用');
}

// 配置火山引擎TOS客户端
let tosClient = null;
if (process.env.TOS_REGION && process.env.TOS_ACCESS_KEY && process.env.TOS_SECRET_KEY) {
  // 处理endpoint，移除协议前缀
  const endpoint = process.env.TOS_ENDPOINT.replace('https://', '').replace('http://', '');
  tosClient = new TosClient({
    region: process.env.TOS_REGION,
    accessKeyId: process.env.TOS_ACCESS_KEY,
    accessKeySecret: process.env.TOS_SECRET_KEY,
    endpoint: endpoint
  });
  console.log('TOS客户端配置成功');
} else {
  console.warn('TOS配置不完整，将使用localhost URL（仅用于开发测试）');
}

// 存储视频分析结果的内存缓存
const videoAnalysisCache = new Map();

// 活跃文件跟踪（防止正在处理的文件被删除）
const activeFiles = new Set();

// 进度跟踪存储
const progressTracker = new Map();

// 进度跟踪辅助函数
function updateProgress(taskId, step, progress, message) {
  const progressData = progressTracker.get(taskId) || {
    steps: [
      { name: '获取视频信息', status: 'pending', progress: 0 },
      { name: '提取音频', status: 'pending', progress: 0 },
      { name: '语音转文字', status: 'pending', progress: 0 },
      { name: 'AI分析生成笔记', status: 'pending', progress: 0 }
    ],
    currentStep: 0,
    overallProgress: 0,
    message: '',
    status: 'processing'
  };
  
  if (step < progressData.steps.length) {
    progressData.steps[step].progress = progress;
    progressData.steps[step].status = progress === 100 ? 'completed' : 'processing';
    progressData.currentStep = step;
  }
  
  progressData.message = message || '';
  progressData.overallProgress = Math.round(progressData.steps.reduce((sum, s) => sum + s.progress, 0) / progressData.steps.length);
  
  progressTracker.set(taskId, progressData);
  console.log(`进度更新 [${taskId}]: 步骤${step + 1} - ${progress}% - ${message}`);
}

// 确保临时目录
const TMP_DIR = path.join(process.cwd(), 'tmp');
// 移除了 yt-dlp 路径配置

// 临时文件清理配置
const CLEANUP_CONFIG = {
  // 保留最近的文件数量（0表示不保留）
  KEEP_RECENT_FILES: 0,
  // 文件保留时间（毫秒，1小时）
  FILE_RETENTION_TIME: 60 * 60 * 1000,
  // 是否启用自动清理
  AUTO_CLEANUP_ENABLED: true,
  // 是否启用定时清理
  SCHEDULED_CLEANUP_ENABLED: true,
  // 定时清理间隔（毫秒，30分钟）
  CLEANUP_INTERVAL: 30 * 60 * 1000,
  // 启动时执行一次清理
  CLEANUP_ON_STARTUP: true
};

async function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    await fsp.mkdir(TMP_DIR, { recursive: true });
  }
}

// 临时文件清理函数
async function cleanupTempFiles(currentFiles = []) {
  if (!CLEANUP_CONFIG.AUTO_CLEANUP_ENABLED) {
    console.log('自动清理已禁用，跳过清理操作');
    return;
  }

  try {
    console.log('开始清理临时文件...');
    
    // 确保临时目录存在
    if (!fs.existsSync(TMP_DIR)) {
      console.log('临时目录不存在，无需清理');
      return;
    }

    // 获取所有临时文件
    const files = await fsp.readdir(TMP_DIR);
    if (files.length === 0) {
      console.log('临时目录为空，无需清理');
      return;
    }

    // 获取文件详细信息
    const fileInfos = [];
    for (const file of files) {
      const filePath = path.join(TMP_DIR, file);
      try {
        const stats = await fsp.stat(filePath);
        fileInfos.push({
          name: file,
          path: filePath,
          mtime: stats.mtime,
          size: stats.size,
          isCurrentFile: currentFiles.some(cf => path.basename(cf) === file),
          isActiveFile: activeFiles.has(filePath) || activeFiles.has(file)
        });
      } catch (err) {
        console.warn(`获取文件信息失败: ${file}`, err.message);
      }
    }

    // 按修改时间排序（最新的在前）
    fileInfos.sort((a, b) => b.mtime - a.mtime);

    const now = Date.now();
    let deletedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < fileInfos.length; i++) {
      const fileInfo = fileInfos[i];
      
      // 跳过当前正在使用的文件
      if (fileInfo.isCurrentFile || fileInfo.isActiveFile) {
        console.log(`跳过活跃文件: ${fileInfo.name}`);
        skippedCount++;
        continue;
      }

      // 保留策略1: 保留最近的N个文件
      if (CLEANUP_CONFIG.KEEP_RECENT_FILES > 0 && i < CLEANUP_CONFIG.KEEP_RECENT_FILES) {
        console.log(`保留最近文件: ${fileInfo.name}`);
        skippedCount++;
        continue;
      }

      // 保留策略2: 检查文件年龄
      const fileAge = now - fileInfo.mtime.getTime();
      if (fileAge < CLEANUP_CONFIG.FILE_RETENTION_TIME) {
        console.log(`文件太新，保留: ${fileInfo.name} (${Math.round(fileAge / 1000 / 60)}分钟前)`);
        skippedCount++;
        continue;
      }

      // 删除文件
      try {
        await fsp.unlink(fileInfo.path);
        console.log(`已删除临时文件: ${fileInfo.name} (${(fileInfo.size / 1024 / 1024).toFixed(2)}MB)`);
        deletedCount++;
      } catch (err) {
        console.error(`删除文件失败: ${fileInfo.name}`, err.message);
        errorCount++;
      }
    }

    console.log(`临时文件清理完成 - 删除: ${deletedCount}, 保留: ${skippedCount}, 错误: ${errorCount}`);
    
    // 如果目录为空，记录日志但不删除目录（保留用于后续使用）
    const remainingFiles = await fsp.readdir(TMP_DIR);
    if (remainingFiles.length === 0) {
      console.log('临时目录已清空');
    }

  } catch (error) {
    console.error('清理临时文件时发生错误:', error.message);
    // 不抛出错误，避免影响主要功能
  }
}

// 清理特定文件的函数
async function cleanupSpecificFiles(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return;
  }

  console.log(`清理指定的 ${filePaths.length} 个文件...`);
  let deletedCount = 0;
  let errorCount = 0;

  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        await fsp.unlink(filePath);
        console.log(`已删除文件: ${path.basename(filePath)} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
        deletedCount++;
      }
    } catch (err) {
      console.error(`删除文件失败: ${filePath}`, err.message);
      errorCount++;
    }
  }

  console.log(`指定文件清理完成 - 删除: ${deletedCount}, 错误: ${errorCount}`);
}

// 移除了 ensureYtDlp 函数，现在使用专用API方法
// Bilibili视频解析下载API
async function downloadBilibiliWithAPI(url, destPath) {
  console.log('尝试使用API解析Bilibili视频:', url);
  
  try {
    // 提取BV号
    const bvMatch = url.match(/BV[a-zA-Z0-9]+/);
    if (!bvMatch) {
      throw new Error('无法从URL中提取BV号');
    }
    const bvid = bvMatch[0];
    console.log('提取到BV号:', bvid);
    
    // 获取视频信息
    const infoUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    const infoResponse = await axios.get(infoUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/'
      }
    });
    
    if (infoResponse.data.code !== 0) {
      throw new Error(`获取视频信息失败: ${infoResponse.data.message}`);
    }
    
    const videoInfo = infoResponse.data.data;
    const cid = videoInfo.cid;
    console.log('获取到CID:', cid);
    
    // 获取视频播放地址 - 优先获取包含音频的格式
    const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnval=1&fourk=1`;
    const playResponse = await axios.get(playUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/'
      }
    });
    
    if (playResponse.data.code !== 0) {
      throw new Error(`获取播放地址失败: ${playResponse.data.message}`);
    }
    
    const playData = playResponse.data.data;
    let videoUrl = null;
    
    // 优先使用durl格式（通常包含音频）
    if (playData.durl && playData.durl.length > 0) {
      videoUrl = playData.durl[0].url;
      console.log('使用durl格式（包含音频）');
    }
    // 如果durl不可用，尝试dash格式但需要检查是否有音频
    else if (playData.dash) {
      console.log('durl不可用，检查dash格式');
      // 检查是否有音频流
      const hasAudio = playData.dash.audio && playData.dash.audio.length > 0;
      if (hasAudio) {
        console.log('dash格式包含音频流，但需要分别下载视频和音频');
        throw new Error('dash格式需要分别处理音视频流，当前不支持');
      } else if (playData.dash.video && playData.dash.video.length > 0) {
        // 如果没有音频流，说明这个视频本身就没有音频
        videoUrl = playData.dash.video[0].baseUrl || playData.dash.video[0].base_url;
        console.log('使用dash视频流（可能无音频）');
      }
    }
    
    if (!videoUrl) {
      throw new Error('无法获取视频下载地址');
    }
    
    console.log('获取到视频下载链接:', videoUrl.substring(0, 100) + '...');
    
    // 下载视频文件
    const videoResponse = await axios.get(videoUrl, {
      responseType: 'stream',
      timeout: 120000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/'
      }
    });
    
    // 保存视频文件
    const writer = fs.createWriteStream(destPath);
    videoResponse.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log('Bilibili API下载完成:', destPath);
        resolve();
      });
      writer.on('error', reject);
      
      // 添加超时处理
      setTimeout(() => {
        writer.destroy();
        reject(new Error('下载超时'));
      }, 180000); // 3分钟超时
    });
    
  } catch (error) {
    console.error('Bilibili API下载失败:', error.message);
    throw error;
  }
}

// 抖音手机端解析下载
async function downloadDouyinWithMobileParser(url, destPath) {
  console.log('尝试通过手机端解析下载抖音视频:', url);
  
  try {
    // 获取重定向后的URL以提取video_id
    const redirectResponse = await axios.get(url, {
      maxRedirects: 5,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
      }
    });
    
    const finalUrl = redirectResponse.request.res.responseUrl || url;
    console.log('重定向后的URL:', finalUrl);
    
    // 提取video_id
    const videoIdMatch = finalUrl.match(/(\d+)/);
    if (!videoIdMatch) {
      throw new Error('无法从URL中提取video_id');
    }
    const videoId = videoIdMatch[1];
    console.log('提取到video_id:', videoId);
    
    // 请求手机端页面获取视频信息
    const mobileUrl = `https://www.iesdouyin.com/share/video/${videoId}/`;
    console.log('请求手机端页面:', mobileUrl);
    
    const pageResponse = await axios.get(mobileUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
        'Referer': 'https://www.douyin.com/?is_from_mobile_home=1&recommend=1'
      }
    });
    
    // 使用正则提取页面中的JSON数据
    const dataMatch = pageResponse.data.match(/window\._ROUTER_DATA\s*=\s*(\{.*?\});?</s);
    if (!dataMatch) {
      throw new Error('无法从页面中提取视频数据');
    }
    
    const jsonData = JSON.parse(dataMatch[1]);
    const itemList = jsonData?.loaderData?.['video_(id)/page']?.videoInfoRes?.item_list?.[0];
    
    if (!itemList) {
      throw new Error('页面数据格式错误，无法解析视频信息');
    }
    
    const videoUri = itemList?.video?.play_addr?.uri;
    if (!videoUri) {
      throw new Error('无法获取视频播放地址');
    }
    
    // 构建视频下载链接
    const videoUrl = videoUri.includes('mp3') ? videoUri : `https://www.douyin.com/aweme/v1/play/?video_id=${videoUri}`;
    console.log('获取到视频下载链接:', videoUrl);
    
    // 下载视频文件
    const videoResponse = await axios.get(videoUrl, {
      responseType: 'stream',
      timeout: 60000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
        'Referer': 'https://www.douyin.com/'
      }
    });
    
    // 保存视频文件
    const writer = fs.createWriteStream(destPath);
    videoResponse.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log('手机端解析下载完成:', destPath);
        resolve();
      });
      writer.on('error', reject);
      
      // 添加超时处理
      setTimeout(() => {
        writer.destroy();
        reject(new Error('下载超时'));
      }, 120000); // 2分钟超时
    });
    
  } catch (error) {
    console.error('手机端解析下载失败:', error.message);
    throw error;
  }
}

// 统一的视频下载函数（使用 yt-dlp）
async function downloadVideo(url, destPath) {
  await ensureTmpDir();
  
  const platform = detectPlatform(url);
  console.log(`开始使用 yt-dlp 下载${platform}视频: ${url}`);
  
  if (!fs.existsSync(ytDlpPath)) {
    throw new Error('未找到 yt-dlp.exe，请确保其位于项目根目录下。');
  }

  const runYtDlp = (args) => new Promise((resolve, reject) => {
    const ytProcess = spawn(ytDlpPath, args, { shell: false });
    let stderrData = '';
    ytProcess.stdout.on('data', (data) => {
      console.log(`[yt-dlp stdout]: ${data}`);
    });
    ytProcess.stderr.on('data', (data) => {
      const text = data.toString();
      console.error(`[yt-dlp stderr]: ${text}`);
      stderrData += text;
    });
    ytProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderrData || `Exit code ${code}`));
      }
      resolve();
    });
    ytProcess.on('error', (err) => {
      reject(new Error(`启动视频下载器失败: ${err.message}`));
    });
  });

  const isDouyin = platform === 'douyin';
  const isBilibili = platform === 'bilibili';
  const referer = isDouyin ? 'https://www.douyin.com' : 'https://www.bilibili.com';
  const origin = isDouyin ? 'https://www.douyin.com' : 'https://www.bilibili.com';

  const commonArgs = [
    url,
    '--output', destPath,
    '--format', 'bestvideo*+bestaudio/best',
    '--merge-output-format', 'mp4',
    '--no-warnings',
    '--no-playlist',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    '--add-header', `referer:${referer}`,
    '--add-header', `origin:${origin}`
  ];
    if (__ffmpegBinaryPath) {
      commonArgs.push('--ffmpeg-location', path.dirname(__ffmpegBinaryPath));
    }

  try {
    await runYtDlp(commonArgs);
  } catch (firstError) {
    const firstBrief = String(firstError.message || firstError).split('\n')[0];
    if (isDouyin) {
      const cookieFile = process.env.DOUYIN_COOKIES_FILE;
      const retryArgs = [...commonArgs];
      if (cookieFile && fs.existsSync(cookieFile)) {
        retryArgs.push('--cookies', cookieFile);
      } else {
        retryArgs.push('--cookies-from-browser', 'chrome');
      }

      try {
        await runYtDlp(retryArgs);
      } catch (secondError) {
        try {
          await downloadDouyinWithMobileParser(url, destPath);
        } catch (fallbackError) {
          const secondBrief = String(secondError.message || secondError).split('\n')[0];
          const fallbackBrief = String(fallbackError.message || fallbackError).split('\n')[0];
          throw new Error(`视频下载失败 (Exit code 1). 详细信息: ${secondBrief}；备用解析失败: ${fallbackBrief}。如需更稳定，请在 .env 配置 DOUYIN_COOKIES_FILE。`);
        }
      }
    } else if (isBilibili) {
      const cookieFile = process.env.BILIBILI_COOKIES_FILE;
      const retryArgs = [...commonArgs];
      if (cookieFile && fs.existsSync(cookieFile)) {
        retryArgs.push('--cookies', cookieFile);
      } else {
        retryArgs.push('--cookies-from-browser', 'chrome');
      }

      try {
        await runYtDlp(retryArgs);
      } catch (secondError) {
        const brief = String(secondError.message || secondError).split('\n')[0];
        throw new Error(`视频下载失败 (Exit code 1). 详细信息: ${brief}`);
      }
    } else {
      throw new Error(`视频下载失败 (Exit code 1). 详细信息: ${firstBrief}`);
    }
  }

  if (fs.existsSync(destPath)) {
    console.log(`${platform}视频下载完成: ${destPath}`);
    return destPath;
  }

  const videoDir = path.dirname(destPath);
  const videoBasename = path.basename(destPath, path.extname(destPath));
  const fallbackCandidates = fs.readdirSync(videoDir)
    .filter(name => name.startsWith(`${videoBasename}.f`) && (name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.mkv')))
    .map(name => path.join(videoDir, name));

  if (fallbackCandidates.length > 0) {
    const fallbackPath = fallbackCandidates[0];
    console.log(`${platform}视频下载完成(分离流): ${fallbackPath}`);
    return fallbackPath;
  }

  throw new Error(`yt-dlp 执行成功但未生成文件: ${destPath}`);
}

// 备用下载函数（用于直接的媒体文件URL）
async function downloadFile(url, destPath) {
  await ensureTmpDir();
  
  // 设置请求头部，模拟浏览器请求
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  };
  
  // 根据URL添加特定的Referer
  if (url.includes('example.com')) {
    headers['Referer'] = 'https://example.com/';
  }
  
  try {
    const response = await axios.get(url, { 
      responseType: 'stream',
      headers: headers,
      timeout: 30000, // 30秒超时
      maxRedirects: 5
    });
    
    const writer = fs.createWriteStream(destPath);
    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      let error = null;
      writer.on('error', err => { error = err; writer.close(); reject(err); });
      writer.on('close', () => { if (!error) resolve(destPath); });
    });
  } catch (error) {
    throw new Error(`下载文件失败: ${error.message}`);
  }
}

// 检查是否存在对应的音频文件（.m4a格式）
function findCorrespondingAudioFile(videoFilePath) {
  if (!videoFilePath || videoFilePath.startsWith('http')) {
    return null;
  }
  
  const videoDir = path.dirname(videoFilePath);
  const videoBasename = path.basename(videoFilePath, path.extname(videoFilePath));
  
  // 检查Bilibili分离下载的音频文件模式：video_timestamp.f30280.m4a
  const m4aFile = path.join(videoDir, `${videoBasename}.f30280.m4a`);
  if (fs.existsSync(m4aFile)) {
    console.log(`找到对应的Bilibili音频文件: ${m4aFile}`);
    return m4aFile;
  }
  
  // 检查其他可能的格式标识符
  const formatIds = ['f30280', 'f30216', 'f30232'];
  for (const formatId of formatIds) {
    const audioFile = path.join(videoDir, `${videoBasename}.${formatId}.m4a`);
    if (fs.existsSync(audioFile)) {
      console.log(`找到对应的音频文件: ${audioFile}`);
      return audioFile;
    }
  }
  
  // 检查其他可能的音频格式
  const audioExtensions = ['.m4a', '.aac', '.mp3'];
  for (const ext of audioExtensions) {
    const audioFile = path.join(videoDir, `${videoBasename}${ext}`);
    if (fs.existsSync(audioFile)) {
      console.log(`找到对应的音频文件: ${audioFile}`);
      return audioFile;
    }
  }
  
  // 最后尝试在目录中查找所有音频文件，匹配时间戳
  try {
    const files = fs.readdirSync(videoDir);
    const timestampMatch = videoBasename.match(/video_(\d+)/);
    if (timestampMatch) {
      const timestamp = timestampMatch[1];
      const audioFile = files.find(file => 
        file.includes(timestamp) && 
        (file.endsWith('.m4a') || file.endsWith('.aac')) &&
        file !== path.basename(videoFilePath)
      );
      if (audioFile) {
        const fullPath = path.join(videoDir, audioFile);
        console.log(`通过时间戳匹配找到音频文件: ${fullPath}`);
        return fullPath;
      }
    }
  } catch (err) {
    console.warn('搜索音频文件时出错:', err.message);
  }
  
  return null;
}

// 验证音频文件完整性
async function validateAudioFile(filePath) {
  return new Promise((resolve, reject) => {
    try {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          console.error('音频文件验证失败:', err.message);
          reject(new Error(`音频文件损坏或格式不正确: ${err.message}`));
          return;
        }
      
      // 检查基本音频信息
      const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
      if (!audioStream) {
        reject(new Error('文件中未找到音频流'));
        return;
      }
      
      // 检查音频时长
      const duration = parseFloat(metadata.format.duration);
      if (!duration || duration < 0.1) {
        reject(new Error('音频文件时长异常'));
        return;
      }
      
      console.log('音频文件验证通过:', {
        duration: `${duration.toFixed(2)}秒`,
        codec: audioStream.codec_name,
        bitrate: audioStream.bit_rate,
        sampleRate: audioStream.sample_rate,
        channels: audioStream.channels
      });
      
      resolve({
        duration,
        codec: audioStream.codec_name,
        bitrate: audioStream.bit_rate,
        sampleRate: audioStream.sample_rate,
        channels: audioStream.channels
      });
      });
    } catch (error) {
      console.error('ffprobe调用异常:', error.message);
      reject(new Error(`ffmpeg配置错误: ${error.message}`));
    }
  });
}

// 从视频提取音频为 mp3（支持本地文件和网络流）
async function extractAudioToMp3(videoInput, outputPath) {
  await ensureTmpDir();
  
  // 首先检查是否存在对应的音频文件
  const existingAudioFile = findCorrespondingAudioFile(videoInput);
  if (existingAudioFile) {
    console.log(`使用已下载的音频文件: ${existingAudioFile}`);
    return new Promise((resolve, reject) => {
      ffmpeg(existingAudioFile)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .audioFrequency(44100)  // 设置采样率
        .audioChannels(2)       // 设置为立体声
        .format('mp3')
        .outputOptions([
          '-q:a', '2',          // 高质量设置
          '-map_metadata', '0', // 保留元数据
          '-write_xing', '0'    // 避免某些播放器的兼容性问题
        ])
        .on('error', (err) => {
          console.error('音频转换错误:', err.message);
          reject(err);
        })
        .on('end', async () => {
          try {
            console.log('音频转换完成，开始验证文件完整性');
            await validateAudioFile(outputPath);
            console.log('音频文件验证通过');
            resolve(outputPath);
          } catch (validationError) {
            console.warn('音频文件验证失败，但继续处理:', validationError.message);
            // 检查文件是否存在且有内容
            if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
              console.log('文件存在且有内容，跳过验证继续处理');
              resolve(outputPath);
            } else {
              reject(validationError);
            }
          }
        })
        .save(outputPath);
    });
  }
  
  // 如果没有找到音频文件，则从视频中提取
  console.log(`从视频文件提取音频: ${videoInput}`);
  
  // 检查ffmpeg是否可用
  if (!__ffmpegConfigured) {
    console.warn('ffmpeg未正确配置，跳过音频提取');
    throw new Error('ffmpeg未正确配置，无法提取音频');
  }
  
  // 首先验证输入文件
  if (!videoInput.startsWith('http')) {
    try {
      if (!fs.existsSync(videoInput)) {
        throw new Error(`视频文件不存在: ${videoInput}`);
      }
      const stats = fs.statSync(videoInput);
      console.log(`视频文件大小: ${stats.size} bytes`);
      if (stats.size === 0) {
        throw new Error(`视频文件为空: ${videoInput}`);
      }
    } catch (fileError) {
      console.error('文件验证失败:', fileError.message);
      return Promise.reject(fileError);
    }
  }
  
  return new Promise((resolve, reject) => {
    const ffmpegCommand = ffmpeg(videoInput)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .audioFrequency(44100)  // 设置采样率
      .audioChannels(2)       // 设置为立体声
      .format('mp3')
      .outputOptions([
        '-q:a', '2',          // 高质量设置
        '-ignore_unknown',    // 忽略未知流
        '-err_detect', 'ignore_err', // 忽略错误
        '-fflags', '+genpts', // 生成时间戳
        '-avoid_negative_ts', 'make_zero' // 避免负时间戳
      ])
      .on('error', (err) => {
        console.error('FFmpeg错误:', err.message);
        console.error('FFmpeg完整错误信息:', err);
        reject(err);
      })
      .on('stderr', (stderrLine) => {
        console.log('FFmpeg stderr:', stderrLine);
      })
      .on('end', async () => {
        try {
          console.log('音频提取完成，开始验证文件完整性');
          await validateAudioFile(outputPath);
          console.log('音频文件验证通过');
          resolve(outputPath);
        } catch (validationError) {
          console.warn('音频文件验证失败，但继续处理:', validationError.message);
          // 检查文件是否存在且有内容
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            console.log('文件存在且有内容，跳过验证继续处理');
            resolve(outputPath);
          } else {
            reject(validationError);
          }
        }
      });
    
    // 如果输入是网络URL，添加额外的输入选项
    if (videoInput.startsWith('http')) {
      ffmpegCommand
        .inputOptions([
          '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          '-headers', 'Accept: video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
          '-reconnect', '1',
          '-reconnect_streamed', '1',
          '-reconnect_delay_max', '5'
        ]);
    }
    
    ffmpegCommand.save(outputPath);
  });
}

// 提交 AUC 任务（录音文件识别）- 支持多种Cluster ID格式尝试
async function submitAucTask({ appid, token, cluster, audioUrl, format = 'mp3' }) {
  const service = 'https://openspeech.bytedance.com/api/v1/auc/submit';
  const requestId = `vidnotes_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // 定义多种可能的Cluster ID格式
  const clusterFormats = [
    cluster, // 用户配置的原始格式
    'volc.auc.common.flash', // 标准格式1
    'volc_auc_common_flash', // 下划线格式
    'common.flash', // 简化格式
    'volc.auc.common', // 不带flash后缀
    'volc_auc_common', // 下划线不带flash
    'flash', // 最简格式
    'volc.bigasr.sauc.duration' // 备用格式
  ];
  
  // 去重并过滤空值
  const uniqueFormats = [...new Set(clusterFormats.filter(Boolean))];
  console.log('将尝试以下Cluster ID格式:', uniqueFormats);
  
  let lastError = null;
  
  for (let i = 0; i < uniqueFormats.length; i++) {
    const currentCluster = uniqueFormats[i];
    console.log(`尝试Cluster格式 ${i + 1}/${uniqueFormats.length}: ${currentCluster}`);
    
    const payload = {
      app: {
        appid: appid,
        token: token,
        cluster: currentCluster
      },
      user: { uid: `vidnotes_${Date.now()}` },
      audio: { 
        url: audioUrl, 
        format: format
      },
      additions: {
        use_itn: 'True',
        use_punc: 'True'
      }
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer; ${token}`,
      'X-Api-Resource-Id': 'volc.bigasr.sauc.duration'
    };
    
    try {
      console.log(`提交ASR任务 (格式${i + 1}):`, {
        service,
        cluster: currentCluster,
        headers: { ...headers, 'Authorization': '[HIDDEN]' },
        payload: { ...payload, app: { ...payload.app, token: '[HIDDEN]' } }
      });
      
      const response = await axios.post(service, payload, { headers });
      console.log(`ASR任务提交响应 (格式${i + 1}):`, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data
      });
      
      // 检查响应格式
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('ASR服务返回无效响应');
      }
      
      // 检查火山引擎录音文件识别API的响应格式
      if (response.data.resp) {
        const { code, message, id } = response.data.resp;
        
        if (code === 1000 && id) {
          console.log(`ASR任务提交成功！使用Cluster格式: ${currentCluster}, 任务ID: ${id}`);
          return response.data;
        } else {
          throw new Error(`ASR任务提交失败: ${message || '未知错误'} (状态码: ${code})`);
        }
      } else {
        throw new Error('ASR服务返回格式异常，缺少resp字段');
      }
    } catch (err) {
      const status = err?.response?.status;
      const responseData = err?.response?.data;
      const detail = responseData ? (typeof responseData === 'string' ? responseData : JSON.stringify(responseData)) : (err?.message || err);
      
      console.warn(`Cluster格式 ${currentCluster} 失败:`, { 
        status, 
        responseData, 
        detail
      });
      
      lastError = err;
      
      // 如果是"no available instances"错误，继续尝试下一个格式
      if (detail.includes('no available instances') || detail.includes('cluster not found')) {
        console.log(`Cluster "${currentCluster}" 不可用，尝试下一个格式...`);
        continue;
      }
      
      // 如果是其他类型的错误（如认证错误），直接抛出
      if (status === 401 || status === 403) {
        throw new Error(`认证失败（HTTP ${status}）：${detail}`);
      }
    }
  }
  
  // 所有格式都失败了
  const finalError = lastError?.response?.data ? 
    (typeof lastError.response.data === 'string' ? lastError.response.data : JSON.stringify(lastError.response.data)) : 
    (lastError?.message || lastError);
  
  console.error('所有Cluster格式都失败了:', {
    triedFormats: uniqueFormats,
    lastError: finalError
  });
  
  throw new Error(`AUC submit 失败，已尝试${uniqueFormats.length}种Cluster格式：${finalError}`);
}

// 查询 AUC 结果
async function queryAucResult({ appid, token, cluster, taskId, pollIntervalMs = 3000, timeoutMs = 15 * 60 * 1000 }) {
  const service = 'https://openspeech.bytedance.com/api/v1/auc/query';
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer; ${token}`,
    'X-Api-Resource-Id': 'volc.bigasr.sauc.duration'
  };
  
  const start = Date.now();
  let pollCount = 0;
  let consecutiveEmptyResponses = 0;
  const maxConsecutiveEmpty = 10; // 最多允许10次连续空响应
  
  while (Date.now() - start < timeoutMs) {
    try {
      pollCount++;
      const body = {
        appid: appid,
        token: token,
        cluster: cluster,
        id: taskId
      };
      console.log(`ASR查询第${pollCount}次，任务ID: ${taskId}`);
      
      const response = await axios.post(service, body, { headers });
      
      // 详细记录响应信息
      console.log('ASR查询响应详情:', {
        status: response.status,
        headers: {
          'x-api-status-code': response.headers['x-api-status-code'],
          'x-api-message': response.headers['x-api-message'],
          'x-api-request-id': response.headers['x-api-request-id']
        },
        data: response.data,
        dataType: typeof response.data,
        dataKeys: response.data ? Object.keys(response.data) : []
      });
      
      // 检查API状态码
      const apiStatusCode = response.headers['x-api-status-code'];
      const apiMessage = response.headers['x-api-message'];
      
      if (apiStatusCode && apiStatusCode !== '20000000') {
        throw new Error(`ASR服务错误: ${apiMessage || '未知错误'} (状态码: ${apiStatusCode})`);
      }
      
      // 处理空响应
      if (!response.data || Object.keys(response.data).length === 0) {
        consecutiveEmptyResponses++;
        console.warn(`收到空响应，连续空响应次数: ${consecutiveEmptyResponses}/${maxConsecutiveEmpty}`);
        
        if (consecutiveEmptyResponses >= maxConsecutiveEmpty) {
          throw new Error(`ASR查询失败: 连续${maxConsecutiveEmpty}次收到空响应，可能任务ID无效或服务异常`);
        }
        
        // 对于空响应，延长等待时间
        const extendedWait = pollIntervalMs * 2;
        console.log(`空响应，延长等待时间到${extendedWait}ms`);
        await new Promise(r => setTimeout(r, extendedWait));
        continue;
      }
      
      // 重置空响应计数器
      consecutiveEmptyResponses = 0;
      
      // 处理不同的响应格式
      let resp = response.data?.resp || response.data;
      
      if (resp && typeof resp === 'object') {
        console.log('ASR任务状态:', {
          code: resp.code,
          message: resp.message,
          hasText: !!resp.text,
          hasUtterances: !!(resp.utterances && resp.utterances.length),
          status: resp.status,
          progress: resp.progress
        });
        
        // 检查是否完成 - 支持多种完成状态
        if ((resp.code === 1000 || resp.status === 'completed' || resp.status === 'success') && 
            (resp.text || (resp.utterances && resp.utterances.length))) {
          console.log('ASR任务完成，返回结果');
          return resp;
        }
        
        // 检查是否有错误
        if (resp.code && resp.code !== 1000 && resp.code !== 1001) { // 1001通常表示处理中
          throw new Error(`ASR任务失败: ${resp.message || '未知错误'} (code: ${resp.code})`);
        }
        
        // 检查状态字段
        if (resp.status === 'failed' || resp.status === 'error') {
          throw new Error(`ASR任务失败: ${resp.message || resp.error || '任务状态为失败'}`);
        }
        
        // 如果有进度信息，显示进度
        if (resp.progress !== undefined) {
          console.log(`ASR任务进度: ${resp.progress}%`);
        }
      } else {
        console.warn('ASR查询响应格式异常，非对象类型:', typeof resp, resp);
      }
      
    } catch (err) {
      const status = err?.response?.status;
      const responseData = err?.response?.data;
      const detail = responseData ? (typeof responseData === 'string' ? responseData : JSON.stringify(responseData)) : (err?.message || err);
      console.warn(`AUC query 轮询第${pollCount}次失败（HTTP ${status ?? 'N/A'}）：${detail}`);
      
      // 如果是致命错误，直接抛出
      if (status && (status < 500 || status === 404)) {
        throw new Error(`ASR查询失败: ${detail}`);
      }
      
      // 对于网络错误，增加重试间隔
      if (!status) {
        console.log('网络错误，延长等待时间');
        await new Promise(r => setTimeout(r, pollIntervalMs * 2));
        continue;
      }
    }
    
    console.log(`等待${pollIntervalMs}ms后进行下次查询...`);
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
  
  throw new Error(`ASR任务超时未完成，已轮询${pollCount}次，耗时${Date.now() - start}ms，连续空响应${consecutiveEmptyResponses}次`);
}

// 添加静态文件服务（仅用于测试，生产环境应使用对象存储）
app.use('/tmp', express.static(TMP_DIR));

// 用户认证路由
// 用户注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 验证输入
    if (!username || !email || !password) {
      return res.status(400).json({ message: '请填写所有必填字段' });
    }

    if (username.length < 3) {
      return res.status(400).json({ message: '用户名至少需要3个字符' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: '密码至少需要6个字符' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: '请输入有效的邮箱地址' });
    }

    // 检查用户是否已存在
    db.get('SELECT * FROM users WHERE email = ? OR username = ?', [email, username], async (err, row) => {
      if (err) {
        console.error('数据库查询错误:', err);
        return res.status(500).json({ message: '服务器内部错误' });
      }

      if (row) {
        if (row.email === email) {
          return res.status(400).json({ message: '该邮箱已被注册' });
        }
        if (row.username === username) {
          return res.status(400).json({ message: '该用户名已被使用' });
        }
      }

      try {
        // 加密密码
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // 插入新用户
        db.run(
          'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
          [username, email, hashedPassword, 'user'],
          function(err) {
            if (err) {
              console.error('用户创建错误:', err);
              return res.status(500).json({ message: '用户创建失败' });
            }

            res.status(201).json({
              message: '用户注册成功',
              user: {
                id: this.lastID,
                username,
                email
              }
            });
          }
        );
      } catch (error) {
        console.error('密码加密错误:', error);
        res.status(500).json({ message: '服务器内部错误' });
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 用户登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: '请填写邮箱和密码' });
    }

    // 查找用户
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        console.error('数据库查询错误:', err);
        return res.status(500).json({ message: '服务器内部错误' });
      }

      if (!user) {
        return res.status(401).json({ message: '邮箱或密码错误' });
      }

      try {
        // 验证密码
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
          return res.status(401).json({ message: '邮箱或密码错误' });
        }

        // 生成JWT token
        const token = jwt.sign(
          { 
            id: user.id, 
            username: user.username, 
            email: user.email,
            role: user.role || 'user'
          },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

        res.json({
          message: '登录成功',
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role || 'user',
            createdAt: user.created_at
          }
        });
      } catch (error) {
        console.error('密码验证错误:', error);
        res.status(500).json({ message: '服务器内部错误' });
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 验证token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  // 如果到达这里，说明token有效
  db.get('SELECT id, username, email, role, created_at FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      console.error('数据库查询错误:', err);
      return res.status(500).json({ message: '服务器内部错误' });
    }

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    res.json({
      message: 'Token有效',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'user',
        createdAt: user.created_at
      }
    });
  });
});

// 获取用户每日使用次数
app.get('/api/usage/daily', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    let userRole = req.user.role;
    
    // 如果JWT token中没有role字段，从数据库获取
    if (!userRole) {
      const user = await new Promise((resolve, reject) => {
        db.get('SELECT role FROM users WHERE id = ?', [userId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      userRole = user?.role || 'user';
    }
    
    // 管理员不限制使用次数
    if (userRole === 'admin') {
      return res.json({
        currentUsage: 0,
        dailyLimit: -1, // -1 表示无限制
        remainingUsage: -1,
        isAdmin: true
      });
    }
    
    const currentUsage = await checkDailyUsage(userId);
    const dailyLimit = 3;
    const remainingUsage = Math.max(0, dailyLimit - currentUsage);
    
    res.json({
      currentUsage,
      dailyLimit,
      remainingUsage,
      isAdmin: false
    });
  } catch (error) {
    console.error('获取使用次数失败:', error);
    res.status(500).json({ error: '获取使用次数失败' });
  }
});

// 上传文件到TOS并返回公网可访问的URL
async function uploadToTos(filePath) {
  if (!tosClient || !process.env.TOS_BUCKET) {
    throw new Error('TOS未配置，请在.env文件中配置TOS相关参数');
  }
  
  const fileName = path.basename(filePath);
  const objectKey = `audio/${Date.now()}_${fileName}`;
  
  try {
    console.log(`开始上传文件到TOS: ${filePath} -> ${objectKey}`);
    
    // 读取文件内容
    const fileContent = fs.readFileSync(filePath);
    
    // 上传到TOS，设置公开读取权限
    const result = await tosClient.putObject({
      bucket: process.env.TOS_BUCKET,
      key: objectKey,
      body: fileContent,
      contentType: 'audio/mpeg',
      acl: 'public-read'  // 设置为公开读取权限
    });
    
    // 构建公网访问URL
    const endpoint = process.env.TOS_ENDPOINT.replace('https://', '').replace('http://', '');
    const publicUrl = `https://${process.env.TOS_BUCKET}.${endpoint}/${objectKey}`;
    
    console.log(`文件上传成功，公网URL: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('TOS上传失败:', error);
    throw new Error(`TOS上传失败: ${error.message}`);
  }
}

// 将本地文件转换为可公网访问的URL
async function makePublicUrl(filePath) {
  // 优先使用TOS上传
  if (tosClient && process.env.TOS_BUCKET) {
    try {
      return await uploadToTos(filePath);
    } catch (error) {
      console.warn('TOS上传失败，回退到localhost URL:', error.message);
    }
  }
  
  // 回退方案：使用localhost URL（仅用于开发测试）
  const fileName = path.basename(filePath);
  const publicUrl = `http://localhost:${PORT}/tmp/${fileName}`;
  console.log(`临时音频URL: ${publicUrl}`);
  
  // 警告：localhost URL无法被外部ASR服务访问
  console.warn('⚠️  警告: 当前使用localhost URL，ASR服务无法访问此地址！');
  console.warn('⚠️  请配置TOS参数以启用公网访问功能');
  
  return publicUrl;
}

// 从分享文本中提取视频链接的函数
function extractVideoUrl(text) {
  // 如果输入的就是一个有效的URL，直接返回
  const trimmedText = text.trim();
  if (isValidVideoUrl(trimmedText)) {
    return trimmedText;
  }
  
  // 使用更通用的方法：从http开始到空格或字符串结尾提取URL
  const urlPattern = /https?:\/\/[^\s]+/g;
  const matches = text.match(urlPattern);
  
  if (matches && matches.length > 0) {
    // 遍历所有匹配的URL，找到第一个有效的视频链接
    for (const url of matches) {
      // 清理URL末尾可能的标点符号
      const cleanUrl = url.replace(/[.,;!?）】\]}>"\'`]+$/, '');
      if (isValidVideoUrl(cleanUrl)) {
        return cleanUrl;
      }
    }
  }
  
  // 如果没有找到有效的URL，返回原始文本
  return text;
}

// 验证视频URL是否有效的函数
function isValidVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  // 支持的视频平台URL模式
  const patterns = [
    /^https?:\/\/(www\.)?(bilibili\.com|b23\.tv)\/.+/,
    /^https?:\/\/(www\.)?(douyin\.com|v\.douyin\.com|vm\.tiktok\.com)\/.+/,
    /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/,
    /^https?:\/\/(www\.)?tiktok\.com\/.+/
  ];
  
  return patterns.some(pattern => pattern.test(url));
}

// 检查用户每日使用次数的函数
async function checkDailyUsage(userId) {
  return new Promise((resolve, reject) => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD格式
    
    db.get(
      'SELECT video_conversions FROM user_usage WHERE user_id = ? AND usage_date = ?',
      [userId, today],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        const currentUsage = row ? row.video_conversions : 0;
        resolve(currentUsage);
      }
    );
  });
}

// 记录用户使用次数的函数
async function recordUsage(userId) {
  return new Promise((resolve, reject) => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD格式
    
    db.run(
      `INSERT INTO user_usage (user_id, usage_date, video_conversions, updated_at) 
       VALUES (?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, usage_date) 
       DO UPDATE SET 
         video_conversions = video_conversions + 1,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, today],
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });
}

// 视频URL解析和处理
app.post('/api/analyze-video', authenticateToken, async (req, res) => {
  const processingFiles = []; // 跟踪当前处理的文件
  
  try {
    const { videoUrl: rawInput } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!rawInput) {
      return res.status(400).json({ error: '请提供视频链接或分享文本' });
    }

    // 检查用户每日使用限制（管理员不限制）
    if (userRole !== 'admin') {
      try {
        const currentUsage = await checkDailyUsage(userId);
        const dailyLimit = 3; // 每日限制3次
        
        if (currentUsage >= dailyLimit) {
          return res.status(429).json({ 
            error: `您今日的视频转换次数已达上限（${dailyLimit}次），请明天再试`,
            currentUsage,
            dailyLimit
          });
        }
      } catch (error) {
        console.error('检查使用次数失败:', error);
        return res.status(500).json({ error: '检查使用次数失败，请稍后重试' });
      }
    }

    // 从输入文本中提取视频URL
    const extractedUrl = extractVideoUrl(rawInput);
    
    // 验证提取的URL是否有效
    if (!isValidVideoUrl(extractedUrl)) {
      return res.status(400).json({ 
        error: '未找到有效的视频链接，请确保输入包含支持的视频平台链接（抖音、哔哩哔哩、YouTube、TikTok）' 
      });
    }
    
    console.log('原始输入:', rawInput);
    console.log('提取的URL:', extractedUrl);

    // 检查缓存（使用提取的URL）
    if (videoAnalysisCache.has(extractedUrl)) {
      return res.json(videoAnalysisCache.get(extractedUrl));
    }

    // 生成任务ID
    const taskId = Date.now().toString();
    console.log('生成任务ID:', taskId);
    
    // 初始化进度
    updateProgress(taskId, 0, 0, '开始分析视频');
    
    // 立即返回任务ID，让前端开始轮询进度
    const responseData = { taskId, status: 'started' };
    console.log('返回响应数据:', responseData);
    res.json(responseData);
    
    // 异步处理视频分析（使用提取的URL）
    processVideoAsync(extractedUrl, taskId, processingFiles, userId, userRole);
    
  } catch (error) {
    console.error('视频分析启动错误:', error);
    res.status(500).json({ error: '视频分析启动失败：' + (error?.message || '请稍后重试') });
  }
});

// 异步处理视频分析
async function processVideoAsync(videoUrl, taskId, processingFiles, userId, userRole) {
  try {
    // 首先提取纯净的视频URL
    const extractedUrl = extractVideoUrl(videoUrl);
    if (!extractedUrl) {
      throw new Error('无法从输入文本中提取有效的视频URL');
    }
    
    console.log('原始输入:', videoUrl);
    console.log('提取的URL:', extractedUrl);
    
    const platform = detectPlatform(extractedUrl);
    
    updateProgress(taskId, 0, 20, '检测视频平台: ' + platform);

    // === 路线A：真实流程（下载视频 -> 提取音频 -> 上传获得公网URL -> 提交ASR -> 轮询结果）===
    let transcript = '';
    const hasArkKey = !!process.env.ARK_API_KEY;
    const aucAppid = process.env.ASR_APPID;
    const aucToken = process.env.ASR_TOKEN; // 无需 Bearer 前缀，填写控制台获取的 token 字符串
    const aucCluster = process.env.ASR_CLUSTER;

    const canUseAsr = !!(aucAppid && aucToken && aucCluster);

    if (canUseAsr) {
      try {
        // 1) 获取视频流URL（避免下载整个文件）
        let videoStreamUrl;
        let useDirectStream = false;
        
        updateProgress(taskId, 0, 40, '正在获取视频流...');
        
        try {
          console.log(`获取视频流URL: ${extractedUrl}`);
          videoStreamUrl = await getVideoStreamUrl(extractedUrl);
          useDirectStream = true;
          console.log('成功获取视频流URL，将直接处理网络流');
          updateProgress(taskId, 0, 60, '获取视频流成功');
        } catch (streamError) {
          console.warn('获取流URL失败，回退到下载模式:', streamError.message);
          updateProgress(taskId, 0, 70, '开始下载视频文件...');
          // 回退到下载模式 - 使用专用API方法
          const videoFile = path.join(TMP_DIR, `video_${Date.now()}.mp4`);
          processingFiles.push(videoFile);
          activeFiles.add(videoFile);
          console.log(`开始下载视频: ${extractedUrl}`);
          
          await downloadVideo(extractedUrl, videoFile);
          
          videoStreamUrl = videoFile;
          console.log('视频下载完成');
          updateProgress(taskId, 0, 100, '视频下载完成');
        }

        // 2) 提取音频（直接从流URL或本地文件）
        let audioFile = '';
        let extractedOk = false;
        try {
          updateProgress(taskId, 1, 20, '开始提取音频...');
          audioFile = path.join(TMP_DIR, `audio_${Date.now()}.mp3`);
          processingFiles.push(audioFile);
          activeFiles.add(audioFile);
          console.log(`开始提取音频，输入源: ${useDirectStream ? '网络流' : '本地文件'}`);
          await extractAudioToMp3(videoStreamUrl, audioFile);
          extractedOk = true;
          console.log('音频提取成功');
          updateProgress(taskId, 1, 100, '音频提取完成');
        } catch (errFfmpeg) {
          console.warn('音频提取失败:', errFfmpeg?.message || errFfmpeg);
          
          // 如果是网络流失败，尝试下载完整视频文件再提取
          if (useDirectStream) {
            try {
              console.log('网络流音频提取失败，回退到下载完整视频文件');
              const videoFile = path.join(TMP_DIR, `video_${Date.now()}.mp4`);
              processingFiles.push(videoFile);
              activeFiles.add(videoFile);
              
              await downloadVideo(extractedUrl, videoFile);
              
              console.log('视频下载完成，重新尝试音频提取');
              
              audioFile = path.join(TMP_DIR, `audio_${Date.now()}.mp3`);
              processingFiles.push(audioFile);
              activeFiles.add(audioFile);
              await extractAudioToMp3(videoFile, audioFile);
              extractedOk = true;
              console.log('从本地视频文件音频提取成功');
            } catch (fallbackError) {
              console.warn('回退方案也失败:', fallbackError?.message || fallbackError);
            }
          }
        }

        // 3) 提交 AUC 任务
        let asrTaskId;
        if (extractedOk) {
          try {
            updateProgress(taskId, 2, 10, '准备提交语音转写任务...');
            // 需要将音频上传到公网可访问的对象存储；本地服务器URL（localhost）不可被 AUC 访问
            const audioPublicUrl = await makePublicUrl(audioFile);
            
            console.log('准备提交ASR任务，音频文件信息:', {
              audioFile,
              audioPublicUrl,
              fileExists: fs.existsSync(audioFile),
              fileSize: fs.existsSync(audioFile) ? fs.statSync(audioFile).size : 'N/A'
            });
            
            updateProgress(taskId, 2, 30, '正在提交ASR任务...');
            const submit = await submitAucTask({ appid: aucAppid, token: aucToken, cluster: aucCluster, audioUrl: audioPublicUrl, format: 'mp3' });
            console.log('ASR任务提交结果:', submit);
            
            asrTaskId = submit?.resp?.id;
            if (!asrTaskId) {
              // 检查是否是因为localhost URL导致的问题
              if (audioPublicUrl.includes('localhost')) {
                throw new Error('ASR服务无法访问localhost地址。请配置公网可访问的对象存储服务，或使用ngrok等工具暴露本地服务。');
              }
              throw new Error(`提交ASR任务失败，未获取到任务ID: ${JSON.stringify(submit)}`);
            }
            
            console.log(`ASR任务提交成功，任务ID: ${asrTaskId}`);
            updateProgress(taskId, 2, 50, 'ASR任务提交成功，等待处理结果...');
          } catch (errSubmit) {
            console.error('音频URL方式提交失败:', errSubmit?.message || errSubmit);
            
            // 如果是localhost访问问题，提供更详细的解决方案
            if (errSubmit?.message?.includes('localhost')) {
              throw new Error('ASR服务无法访问localhost地址。解决方案：\n1. 使用ngrok暴露本地服务: ngrok http 3001\n2. 配置公网可访问的对象存储服务\n3. 部署到有公网IP的服务器');
            }
            
            throw errSubmit;
          }
        }

        if (!asrTaskId) {
          // 备用方案失败：B站等视频平台的链接不是直接的媒体文件URL，ASR服务无法处理
          throw new Error('音频提取失败且无法直接处理视频链接。请尝试上传本地视频文件或提供直接的音频/视频文件URL。');
        }

        // 4) 轮询获取结果
        updateProgress(taskId, 2, 70, '正在进行语音转写...');
        const asr = await queryAucResult({ appid: aucAppid, token: aucToken, cluster: aucCluster, taskId: asrTaskId });
        transcript = asr?.text || '';
        updateProgress(taskId, 2, 100, '语音转写完成');
      } catch (e) {
        throw new Error(`ASR转写失败：${e?.message || e}`);
      }
    } else {
      throw new Error('未配置ASR服务，请在.env文件中配置ASR_APPID、ASR_TOKEN和ASR_CLUSTER');
    }

    // 使用豆包AI生成笔记和摘要（若未配置ARK_API_KEY，则返回占位说明）
    let notes = '';
    updateProgress(taskId, 3, 20, '开始AI分析生成笔记...');
    if (hasArkKey && client) {
      const completion = await client.chat.completions.create({
          model: process.env.ARK_MODEL_ID || 'doubao-seed-1.6',
          messages: [
            {              role: 'system',              content: '请根据视频转录内容生成简洁的中文总结，用纯文本格式输出。'            },
            {
              role: 'user',
              content: `请分析以下视频内容并按照结构化框架生成总结：\n\n${transcript}`
            }
          ],
          temperature: 0.7,
          max_tokens: 1200
        });
      notes = completion.choices?.[0]?.message?.content || '（无返回内容）';
    } else {
      // 占位总结
      const brief = transcript.slice(0, 300);
      notes = `未检测到 ARK_API_KEY，已返回占位总结。\n\n摘要要点\n内容片段：${brief}${transcript.length > 300 ? '……' : ''}\n请在 .env 配置 ARK_API_KEY 与 ARK_MODEL_ID（推荐：doubao-seed-1.6 或 doubao-seed-1.6-flash），以启用豆包大模型自动笔记。`;
    }
    updateProgress(taskId, 3, 100, 'AI分析完成');

    const analysis = {
      id: taskId,
      videoUrl: extractedUrl,
      title: await extractVideoTitle(extractedUrl),
      transcript,
      notes,
      createdAt: new Date().toISOString(),
      platform
    };

    // 缓存结果
    videoAnalysisCache.set(extractedUrl, analysis);
    
    // 记录用户使用次数（管理员不记录）
    if (userRole !== 'admin') {
      try {
        await recordUsage(userId);
        console.log(`用户 ${userId} 视频转换次数已记录`);
      } catch (error) {
        console.error('记录使用次数失败:', error);
        // 不影响主流程，只记录错误
      }
    }
    
    // 更新进度为完成状态
    const finalProgress = progressTracker.get(taskId);
    if (finalProgress) {
      finalProgress.status = 'completed';
      finalProgress.result = analysis;
      finalProgress.overallProgress = 100;
      finalProgress.message = '分析完成';
      progressTracker.set(taskId, finalProgress);
    }

    // 从活跃文件集合中移除已处理完成的文件
    processingFiles.forEach(file => {
      activeFiles.delete(file);
    });

    // 异步清理临时文件（不阻塞响应）
    setImmediate(() => {
      cleanupTempFiles(processingFiles).catch(err => {
        console.warn('清理临时文件失败:', err.message);
      });
    });

    console.log(`视频分析完成 [${taskId}]:`, analysis.title);
  } catch (error) {
    console.error('视频分析错误:', error);
    
    // 更新进度为错误状态
    const errorProgress = progressTracker.get(taskId);
    if (errorProgress) {
      errorProgress.status = 'error';
      errorProgress.message = '分析失败：' + (error?.message || '请稍后重试');
      progressTracker.set(taskId, errorProgress);
    }
    
    // 从活跃文件集合中移除文件（即使出错）
    processingFiles.forEach(file => {
      activeFiles.delete(file);
    });
    
    // 即使出错也要清理临时文件
    setImmediate(() => {
      cleanupTempFiles(processingFiles).catch(err => {
        console.warn('清理临时文件失败:', err.message);
      });
    });
  }
}

// AI问答功能
app.post('/api/chat', async (req, res) => {
  try {
    const { message, videoId, context } = req.body;

    if (!message) {
      return res.status(400).json({ error: '请提供问题内容' });
    }

    // 检查是否配置了豆包AI
    if (!client) {
      return res.status(400).json({ 
        error: '未配置豆包AI服务，请在.env文件中配置ARK_API_KEY和ARK_MODEL_ID' 
      });
    }

    // 构建对话上下文
    const messages = [
      {
        role: 'system',
        content: `你是一个专业的视频内容问答助手。你可以基于视频的转录内容和笔记来回答用户的问题。请准确、详细地回答问题，并在回答中引用相关的视频内容。如果问题超出视频内容范围，请说明这一点。

视频内容上下文：
${context || '暂无视频内容上下文'}`
      },
      {
        role: 'user',
        content: message
      }
    ];

    const completion = await client.chat.completions.create({
      model: process.env.ARK_MODEL_ID || 'doubao-seed-1.6',
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000
    });

    res.json({
      response: completion.choices[0].message.content,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('AI问答错误:', error);
    res.status(500).json({ error: 'AI问答失败，请稍后重试' });
  }
});

// 获取分析历史
app.get('/api/history', (req, res) => {
  const history = Array.from(videoAnalysisCache.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(history);
});

// 获取特定视频分析结果
app.get('/api/analysis/:id', (req, res) => {
  const { id } = req.params;
  const analysis = Array.from(videoAnalysisCache.values())
    .find(item => item.id === id);

  if (!analysis) {
    return res.status(404).json({ error: '未找到分析结果' });
  }

  res.json(analysis);
});

// 分享功能相关API
const shareCache = new Map();

// 创建分享链接
app.post('/api/share', (req, res) => {
  const { title, content, type, recordId } = req.body;
  
  if (!title || !content || !type) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  
  // 生成唯一的分享ID
  const shareId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  
  const shareData = {
    id: shareId,
    title,
    content,
    type, // 'summary' 或 'transcript'
    recordId, // 关联的记录ID，用于删除时清理
    createdAt: new Date().toISOString(),
    views: 0
  };
  
  shareCache.set(shareId, shareData);
  
  res.json({ 
    shareId, 
    shareUrl: `https://vidnotes.mrgrl.com/share/${shareId}` 
  });
});

// 获取分享内容
app.get('/api/share/:shareId', (req, res) => {
  const { shareId } = req.params;
  const shareData = shareCache.get(shareId);
  
  if (!shareData) {
    return res.status(404).json({ error: '分享内容不存在或已过期' });
  }
  
  // 增加访问次数
  shareData.views += 1;
  shareCache.set(shareId, shareData);
  
  res.json(shareData);
});

// 删除分享链接（根据记录ID删除相关的分享链接）
app.delete('/api/share/record/:recordId', (req, res) => {
  const { recordId } = req.params;
  
  // 查找并删除与该记录ID相关的所有分享链接
  let deletedCount = 0;
  for (const [shareId, shareData] of shareCache.entries()) {
    // 通过recordId字段精确匹配
    if (shareData.recordId === recordId) {
      shareCache.delete(shareId);
      deletedCount++;
    }
  }
  
  res.json({ 
    success: true, 
    deletedCount,
    message: `已删除 ${deletedCount} 个相关分享链接` 
  });
});

// 删除单个分享链接
app.delete('/api/share/:shareId', (req, res) => {
  const { shareId } = req.params;
  
  if (shareCache.has(shareId)) {
    shareCache.delete(shareId);
    res.json({ success: true, message: '分享链接已删除' });
  } else {
    res.status(404).json({ error: '分享链接不存在' });
  }
});

// 工具函数

// 获取视频的真实流媒体URL（用于FFmpeg直接处理）
async function getVideoStreamUrl(videoUrl) {
  // 对于大部分平台，优先尝试下载以保证稳定性
  throw new Error(`不再尝试直接流处理，强制走 yt-dlp 下载流程`);
}

// 提取视频标题（使用专用API获取真实标题）
async function extractVideoTitle(videoUrl) {
  const platform = detectPlatform(videoUrl);
  
  // 对于哔哩哔哩，尝试通过API获取真实标题
  if (platform === 'bilibili') {
    try {
      const bvMatch = videoUrl.match(/BV[a-zA-Z0-9]+/);
      if (bvMatch) {
        const bvid = bvMatch[0];
        const infoUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
        const response = await axios.get(infoUrl, {
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.bilibili.com/'
          }
        });
        if (response.data.code === 0 && response.data.data.title) {
          return response.data.data.title;
        }
      }
    } catch (error) {
      console.warn('获取哔哩哔哩视频标题失败:', error.message);
    }
  }
  
  // 对于抖音，暂时使用默认标题（抖音API获取标题较复杂）
  
  // 备用标题
  const titles = {
    'bilibili': '哔哩哔哩视频内容',
    'douyin': '抖音视频内容',
    'default': '视频内容分析'
  };
  
  return titles[platform] || titles.default;
}

function detectPlatform(videoUrl) {
  if (videoUrl.includes('bilibili.com') || videoUrl.includes('b23.tv')) {
    return 'bilibili';
  } else if (videoUrl.includes('douyin.com') || videoUrl.includes('v.douyin.com') || videoUrl.includes('vm.tiktok.com')) {
    return 'douyin';
  } else if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
    return 'youtube';
  }
  return 'unknown';
}

// 手动清理临时文件
app.post('/api/cleanup', async (req, res) => {
  try {
    console.log('收到手动清理请求');
    
    // 获取清理前的文件统计
    let beforeStats = { count: 0, size: 0 };
    if (fs.existsSync(TMP_DIR)) {
      const files = await fsp.readdir(TMP_DIR);
      for (const file of files) {
        try {
          const stats = await fsp.stat(path.join(TMP_DIR, file));
          beforeStats.count++;
          beforeStats.size += stats.size;
        } catch (err) {
          // 忽略单个文件的错误
        }
      }
    }
    
    // 执行清理
    await cleanupTempFiles();
    
    // 获取清理后的文件统计
    let afterStats = { count: 0, size: 0 };
    if (fs.existsSync(TMP_DIR)) {
      const files = await fsp.readdir(TMP_DIR);
      for (const file of files) {
        try {
          const stats = await fsp.stat(path.join(TMP_DIR, file));
          afterStats.count++;
          afterStats.size += stats.size;
        } catch (err) {
          // 忽略单个文件的错误
        }
      }
    }
    
    const deletedCount = beforeStats.count - afterStats.count;
    const freedSpace = beforeStats.size - afterStats.size;
    
    res.json({
      success: true,
      message: '临时文件清理完成',
      stats: {
        before: {
          files: beforeStats.count,
          size: `${(beforeStats.size / 1024 / 1024).toFixed(2)}MB`
        },
        after: {
          files: afterStats.count,
          size: `${(afterStats.size / 1024 / 1024).toFixed(2)}MB`
        },
        deleted: {
          files: deletedCount,
          size: `${(freedSpace / 1024 / 1024).toFixed(2)}MB`
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('手动清理失败:', error);
    res.status(500).json({
      success: false,
      error: '清理失败：' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 获取临时文件状态
app.get('/api/temp-status', async (req, res) => {
  try {
    let stats = { count: 0, size: 0, files: [] };
    
    if (fs.existsSync(TMP_DIR)) {
      const files = await fsp.readdir(TMP_DIR);
      
      for (const file of files) {
        try {
          const filePath = path.join(TMP_DIR, file);
          const fileStats = await fsp.stat(filePath);
          stats.count++;
          stats.size += fileStats.size;
          stats.files.push({
            name: file,
            size: `${(fileStats.size / 1024 / 1024).toFixed(2)}MB`,
            modified: fileStats.mtime.toISOString(),
            age: `${Math.round((Date.now() - fileStats.mtime.getTime()) / 1000 / 60)}分钟前`
          });
        } catch (err) {
          // 忽略单个文件的错误
        }
      }
      
      // 按修改时间排序
      stats.files.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    }
    
    res.json({
      tempDir: TMP_DIR,
      totalFiles: stats.count,
      totalSize: `${(stats.size / 1024 / 1024).toFixed(2)}MB`,
      files: stats.files,
      config: {
        autoCleanup: CLEANUP_CONFIG.AUTO_CLEANUP_ENABLED,
        keepRecentFiles: CLEANUP_CONFIG.KEEP_RECENT_FILES,
        retentionHours: CLEANUP_CONFIG.FILE_RETENTION_TIME / (1000 * 60 * 60)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('获取临时文件状态失败:', error);
    res.status(500).json({
      error: '获取状态失败：' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 获取任务进度
app.get('/api/progress/:taskId', (req, res) => {
  const { taskId } = req.params;
  const progress = progressTracker.get(taskId);
  
  if (!progress) {
    return res.status(404).json({ error: '任务不存在' });
  }
  
  res.json(progress);
});

// 定时清理调度器
let cleanupInterval = null;

// 启动定时清理
function startScheduledCleanup() {
  if (!CLEANUP_CONFIG.SCHEDULED_CLEANUP_ENABLED) {
    console.log('定时清理已禁用');
    return;
  }

  // 清除现有的定时器
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  console.log(`启动定时清理，间隔: ${CLEANUP_CONFIG.CLEANUP_INTERVAL / 1000 / 60}分钟`);
  
  // 设置定时清理
  cleanupInterval = setInterval(async () => {
    console.log('执行定时清理任务...');
    try {
      await cleanupTempFiles();
    } catch (error) {
      console.error('定时清理失败:', error.message);
    }
  }, CLEANUP_CONFIG.CLEANUP_INTERVAL);
}

// 停止定时清理
function stopScheduledCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('定时清理已停止');
  }
}

// 优雅关闭处理
process.on('SIGINT', () => {
  console.log('\n收到SIGINT信号，正在优雅关闭...');
  stopScheduledCleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n收到 SIGTERM 信号，正在关闭服务器...');
  stopScheduledCleanup();
  process.exit(0);
});

// 管理界面路由
app.get('/admin', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'api', 'admin.html'));
});

// 调试页面路由
app.get('/debug-auth', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'debug-auth.html'));
});

// 管理API - 获取用户数据和统计信息
app.get('/api/admin/users', requireAdmin, (req, res) => {
  try {
    // 获取所有用户（包含角色信息）
    db.all('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC', (err, users) => {
      if (err) {
        console.error('获取用户数据失败:', err);
        return res.status(500).json({ message: '获取用户数据失败' });
      }

      // 计算统计数据
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const todayUsers = users.filter(user => {
        const userDate = new Date(user.created_at);
        return userDate >= today;
      }).length;

      const weekUsers = users.filter(user => {
        const userDate = new Date(user.created_at);
        return userDate >= weekAgo;
      }).length;

      const stats = {
        total: users.length,
        today: todayUsers,
        week: weekUsers
      };

      res.json({
        success: true,
        users: users,
        stats: stats
      });
    });
  } catch (error) {
    console.error('管理API错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 管理API - 删除用户
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ message: '无效的用户ID' });
    }

    // 防止删除管理员账户
    if (userId === req.user.id) {
      return res.status(400).json({ message: '不能删除自己的账户' });
    }

    // 先检查用户是否存在
    db.get('SELECT id, username, role FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('查询用户失败:', err);
        return res.status(500).json({ message: '查询用户失败' });
      }

      if (!user) {
        return res.status(404).json({ message: '用户不存在' });
      }

      // 防止删除其他管理员
      if (user.role === 'admin') {
        return res.status(400).json({ message: '不能删除管理员账户' });
      }

      // 删除用户
      db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
        if (err) {
          console.error('删除用户失败:', err);
          return res.status(500).json({ message: '删除用户失败' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ message: '用户不存在或已被删除' });
        }

        console.log(`管理员删除用户: ${user.username} (ID: ${userId})`);
        res.json({
          success: true,
          message: `用户 ${user.username} 删除成功`,
          deletedUserId: userId
        });
      });
    });
  } catch (error) {
    console.error('删除用户API错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

app.listen(PORT, async () => {
  console.log(`\n🚀 服务器启动成功！`);
  console.log(`📍 服务器地址: http://localhost:${PORT}`);
  console.log(`🔗 API地址: http://localhost:${PORT}/api`);
  console.log(`👨‍💼 管理界面: http://localhost:${PORT}/admin`);
  console.log(`📊 健康检查: http://localhost:${PORT}/api/health`);
  
  // 启动时执行一次清理
  if (CLEANUP_CONFIG.CLEANUP_ON_STARTUP) {
    console.log('\n🧹 执行启动时清理...');
    try {
      await cleanupTempFiles();
    } catch (error) {
      console.error('启动时清理失败:', error.message);
    }
  }
  
  // 启动定时清理
  startScheduledCleanup();
});
