const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const moment = require('moment');
const winston = require('winston');

// 创建日志目录
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// 配置日志
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// 创建上传目录
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  logger.info(`创建上传目录: ${uploadDir}`);
}

// 中间件
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: ['http://localhost:8080', 'http://127.0.0.1:8080'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// 根路径：后端管理入口页（避免直接访问 / 得到404 JSON）
app.get('/', (req, res) => {
  const nonce = crypto.randomBytes(16).toString('base64');

  // 该页面需要内联脚本进行可视化操作；为此仅对本页面放开 nonce
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; base-uri 'self'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-${nonce}';`
  );
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>噪音监控系统 - 后端控制台</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,'Microsoft YaHei','PingFang SC',sans-serif;background:#f6f7fb;color:#111;margin:0;padding:24px;}
    .wrap{max-width:1100px;margin:0 auto;}
    .card{background:#fff;border:1px solid #e6e8ef;border-radius:12px;padding:18px;margin-bottom:14px;}
    h1{margin:0 0 6px 0;font-size:18px;}
    h2{margin:0 0 10px 0;font-size:15px;}
    .muted{color:#6b7280;font-size:13px;line-height:1.6;}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
    label{display:block;font-size:12px;color:#374151;margin:8px 0 6px;}
    input,select{width:100%;padding:10px 12px;border:1px solid #d7dbe8;border-radius:10px;font-size:13px;}
    button{padding:10px 12px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:13px;cursor:pointer;}
    button.secondary{background:#111827;}
    button.ghost{background:#eef2ff;color:#1f2937;}
    .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;}
    pre{background:#0b1020;color:#dbeafe;padding:12px;border-radius:10px;overflow:auto;font-size:12px;}
    a{color:#2563eb;text-decoration:none;}
    a:hover{text-decoration:underline;}
    @media (max-width: 900px){.row{grid-template-columns:1fr;}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>自习课噪音监控系统 - 后端控制台</h1>
      <div class="muted">
        前端页面通常由 <code>start-server.bat</code> 启动在 <a href="http://localhost:8080" target="_blank">http://localhost:8080</a>。
        后端 API 默认在 <code>http://localhost:3000</code>。
      </div>
      <div class="actions">
        <a href="/api" target="_blank">/api</a>
        <a href="/health" target="_blank">/health</a>
        <a href="/system-info" target="_blank">/system-info</a>
      </div>
    </div>

    <div class="row">
      <div class="card">
        <h2>1) 登录获取 Token</h2>
        <div class="muted">用管理员账号登录后，可创建教师账号、导出CSV、查看报告HTML预览。</div>
        <label>用户名</label>
        <input id="loginUsername" placeholder="admin" />
        <label>密码</label>
        <input id="loginPassword" type="password" placeholder="admin123" />
        <div class="actions">
          <button id="loginBtn">登录</button>
          <button id="logoutBtn" class="ghost" type="button">清除本地Token</button>
        </div>
        <label>当前 Token（本地存储）</label>
        <pre id="tokenBox">(empty)</pre>
      </div>

      <div class="card">
        <h2>2) 创建教师账号（管理员）</h2>
        <div class="muted">对应接口：<code>POST /api/users</code>（需要管理员Token）。</div>
        <label>用户名</label>
        <input id="newUsername" placeholder="teacher01" />
        <label>密码</label>
        <input id="newPassword" type="password" placeholder="至少6位" />
        <label>真实姓名</label>
        <input id="newRealName" placeholder="张老师" />
        <label>角色</label>
        <select id="newRole">
          <option value="teacher">teacher</option>
          <option value="grade_admin">grade_admin</option>
          <option value="admin">admin</option>
        </select>
        <div class="actions">
          <button id="createUserBtn">创建账号</button>
        </div>
        <label>响应</label>
        <pre id="createUserResult">(empty)</pre>
      </div>
    </div>

    <div class="card">
      <h2>3) 导出 CSV / 查看纪律报告（HTML）</h2>
      <div class="muted">
        CSV：<code>GET /api/recordings/export/csv</code>
        | 报告：<code>GET /api/analysis/discipline-report?format=html</code>
      </div>
      <div class="actions">
        <button id="openCsvBtn" class="secondary" type="button">下载录制CSV</button>
        <button id="openReportBtn" type="button">打开纪律报告（HTML预览）</button>
      </div>
      <div class="muted" style="margin-top:10px;">
        提示：如果你不想在URL里带 token，也可以用 API 工具携带 <code>Authorization: Bearer</code> 请求 JSON。
      </div>
    </div>

    <div class="row">
      <div class="card">
        <h2>4) 用户列表（管理员）</h2>
        <div class="muted">对应接口：<code>GET /api/users</code>（需要管理员Token）。</div>
        <div class="actions">
          <button id="loadUsersBtn" class="secondary" type="button">加载用户列表</button>
        </div>
        <label>响应</label>
        <pre id="usersResult">(empty)</pre>
      </div>

      <div class="card">
        <h2>5) 重置密码（管理员）</h2>
        <div class="muted">对应接口：<code>POST /api/auth/reset-password</code>（需要管理员Token）。</div>
        <label>用户ID</label>
        <input id="resetUserId" placeholder="例如：2" />
        <label>新密码</label>
        <input id="resetNewPassword" type="password" placeholder="至少6位" />
        <div class="actions">
          <button id="resetPasswordBtn">重置密码</button>
        </div>
        <label>响应</label>
        <pre id="resetPasswordResult">(empty)</pre>
      </div>
    </div>

    <div class="card">
      <h2>6) 班级管理</h2>
      <div class="muted">对应接口：<code>GET/POST /api/classrooms</code>、<code>GET /api/classrooms/:id/stats</code>、<code>DELETE /api/classrooms/:id</code>。</div>
      <div class="row" style="margin-top:12px;">
        <div class="card" style="margin:0;">
          <h2 style="margin:0 0 10px 0; font-size:14px;">创建班级</h2>
          <label>班级名称</label>
          <input id="className" placeholder="高一(1)班" />
          <label>年级（可选）</label>
          <input id="classGrade" placeholder="高一" />
          <label>学生人数（可选）</label>
          <input id="classStudentCount" placeholder="45" />
          <label>描述（可选）</label>
          <input id="classDesc" placeholder="重点班/普通班等" />
          <label>分配教师（可选）</label>
          <select id="classTeacher"></select>
          <div class="actions">
            <button id="loadTeachersBtn" class="ghost" type="button">加载教师列表</button>
            <button id="createClassBtn" type="button">创建班级</button>
          </div>
          <label>响应</label>
          <pre id="createClassResult">(empty)</pre>
        </div>

        <div class="card" style="margin:0;">
          <h2 style="margin:0 0 10px 0; font-size:14px;">班级列表 / 统计 / 删除</h2>
          <div class="actions">
            <button id="loadClassesBtn" class="secondary" type="button">加载班级列表</button>
          </div>
          <label>班级ID（用于统计/删除）</label>
          <input id="classIdInput" placeholder="例如：class_2023_1" />
          <div class="actions">
            <button id="viewClassStatsBtn" type="button">查看统计</button>
            <button id="deleteClassBtn" class="secondary" type="button">删除班级</button>
          </div>
          <label>响应</label>
          <pre id="classesResult">(empty)</pre>
        </div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    function getToken(){
      return localStorage.getItem('noise_monitor_token') || '';
    }
    function setToken(t){
      if (!t) localStorage.removeItem('noise_monitor_token');
      else localStorage.setItem('noise_monitor_token', t);
      renderToken();
    }
    function renderToken(){
      const t = getToken();
      document.getElementById('tokenBox').textContent = t ? t : '(empty)';
    }
    async function login(){
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        alert(data.error || '登录失败');
        return;
      }
      setToken(data.token);
      alert('登录成功');
    }
    async function createUser(){
      const token = getToken();
      if (!token) {
        alert('请先登录获取Token');
        return;
      }
      const payload = {
        username: document.getElementById('newUsername').value.trim(),
        password: document.getElementById('newPassword').value,
        real_name: document.getElementById('newRealName').value.trim(),
        role: document.getElementById('newRole').value
      };
      const resp = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(payload)
      });
      const data = await resp.json().catch(() => ({}));
      document.getElementById('createUserResult').textContent = JSON.stringify(data, null, 2);
      if (!resp.ok) {
        alert(data.error || '创建失败');
        return;
      }
      alert('创建成功');
    }
    function openCsv(){
      const token = getToken();
      if (!token) {
        alert('请先登录获取Token');
        return;
      }
      window.open('/api/recordings/export/csv?token=' + encodeURIComponent(token), '_blank');
    }
    function openReport(){
      const token = getToken();
      if (!token) {
        alert('请先登录获取Token');
        return;
      }
      window.open('/api/analysis/discipline-report?format=html&token=' + encodeURIComponent(token), '_blank');
    }

    async function loadUsers(){
      const token = getToken();
      if (!token) {
        alert('请先登录获取Token');
        return;
      }
      const resp = await fetch('/api/users?page=1&limit=50', {
        headers: {
          'Authorization': 'Bearer ' + token
        }
      });
      const data = await resp.json().catch(() => ({}));
      document.getElementById('usersResult').textContent = JSON.stringify(data, null, 2);
      if (!resp.ok) {
        alert(data.error || '加载失败');
      }
    }

    async function resetPassword(){
      const token = getToken();
      if (!token) {
        alert('请先登录获取Token');
        return;
      }
      const userId = parseInt(document.getElementById('resetUserId').value, 10);
      const newPassword = document.getElementById('resetNewPassword').value;
      const resp = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ userId, newPassword })
      });
      const data = await resp.json().catch(() => ({}));
      document.getElementById('resetPasswordResult').textContent = JSON.stringify(data, null, 2);
      if (!resp.ok) {
        alert(data.error || '重置失败');
        return;
      }
      alert('重置成功');
    }

    async function loadTeachers(){
      const token = getToken();
      if (!token) {
        alert('请先登录获取Token');
        return;
      }
      const teacherSelect = document.getElementById('classTeacher');
      teacherSelect.innerHTML = '';
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = '(不分配)';
      teacherSelect.appendChild(emptyOption);

      const resp = await fetch('/api/users?page=1&limit=200&role=teacher', {
        headers: {
          'Authorization': 'Bearer ' + token
        }
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        alert(data.error || '加载教师失败');
        return;
      }

      const users = Array.isArray(data.data) ? data.data : [];
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = String(u.id);
        opt.textContent = String(u.id) + ' - ' + (u.real_name || u.username);
        teacherSelect.appendChild(opt);
      });
    }

    async function createClassroom(){
      const token = getToken();
      if (!token) {
        alert('请先登录获取Token');
        return;
      }
      const name = document.getElementById('className').value.trim();
      const grade = document.getElementById('classGrade').value.trim();
      const description = document.getElementById('classDesc').value.trim();
      const teacherIdStr = document.getElementById('classTeacher').value;
      const studentCountStr = document.getElementById('classStudentCount').value.trim();

      const payload = { name };
      if (grade) payload.grade = grade;
      if (description) payload.description = description;
      if (teacherIdStr) payload.teacher_id = parseInt(teacherIdStr, 10);
      if (studentCountStr) payload.student_count = parseInt(studentCountStr, 10);

      const resp = await fetch('/api/classrooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(payload)
      });
      const data = await resp.json().catch(() => ({}));
      document.getElementById('createClassResult').textContent = JSON.stringify(data, null, 2);
      if (!resp.ok) {
        alert(data.error || '创建班级失败');
        return;
      }
      alert('班级创建成功');
    }

    async function loadClassrooms(){
      const token = getToken();
      if (!token) {
        alert('请先登录获取Token');
        return;
      }
      const resp = await fetch('/api/classrooms?page=1&limit=100', {
        headers: {
          'Authorization': 'Bearer ' + token
        }
      });
      const data = await resp.json().catch(() => ({}));
      document.getElementById('classesResult').textContent = JSON.stringify(data, null, 2);
      if (!resp.ok) {
        alert(data.error || '加载班级失败');
      }
    }

    async function viewClassStats(){
      const token = getToken();
      if (!token) {
        alert('请先登录获取Token');
        return;
      }
      const classId = document.getElementById('classIdInput').value.trim();
      if (!classId) {
        alert('请填写班级ID');
        return;
      }
      const resp = await fetch('/api/classrooms/' + encodeURIComponent(classId) + '/stats', {
        headers: {
          'Authorization': 'Bearer ' + token
        }
      });
      const data = await resp.json().catch(() => ({}));
      document.getElementById('classesResult').textContent = JSON.stringify(data, null, 2);
      if (!resp.ok) {
        alert(data.error || '获取统计失败');
      }
    }

    async function deleteClassroom(){
      const token = getToken();
      if (!token) {
        alert('请先登录获取Token');
        return;
      }
      const classId = document.getElementById('classIdInput').value.trim();
      if (!classId) {
        alert('请填写班级ID');
        return;
      }
      if (!confirm('确定要删除班级 ' + classId + ' 吗？')) {
        return;
      }
      const resp = await fetch('/api/classrooms/' + encodeURIComponent(classId), {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + token
        }
      });
      const data = await resp.json().catch(() => ({}));
      document.getElementById('classesResult').textContent = JSON.stringify(data, null, 2);
      if (!resp.ok) {
        alert(data.error || '删除失败');
        return;
      }
      alert('删除成功');
    }

    document.getElementById('loginBtn').addEventListener('click', login);
    document.getElementById('logoutBtn').addEventListener('click', () => setToken(''));
    document.getElementById('createUserBtn').addEventListener('click', createUser);
    document.getElementById('openCsvBtn').addEventListener('click', openCsv);
    document.getElementById('openReportBtn').addEventListener('click', openReport);
    document.getElementById('loadUsersBtn').addEventListener('click', loadUsers);
    document.getElementById('resetPasswordBtn').addEventListener('click', resetPassword);
    document.getElementById('loadTeachersBtn').addEventListener('click', loadTeachers);
    document.getElementById('createClassBtn').addEventListener('click', createClassroom);
    document.getElementById('loadClassesBtn').addEventListener('click', loadClassrooms);
    document.getElementById('viewClassStatsBtn').addEventListener('click', viewClassStats);
    document.getElementById('deleteClassBtn').addEventListener('click', deleteClassroom);

    renderToken();
  </script>
</body>
</html>`);
});

// 请求日志中间件
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} - ${req.ip}`);
  next();
});

// 数据库初始化
const { initDatabase } = require('./config/database');
initDatabase().then(() => {
  logger.info('数据库初始化完成');
}).catch(err => {
  logger.error('数据库初始化失败:', err);
});

// 路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const classroomRoutes = require('./routes/classrooms');
const recordingRoutes = require('./routes/recordings');
const analysisRoutes = require('./routes/analysis');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/analysis', analysisRoutes);

// API文档路由
app.get('/api', (req, res) => {
  res.json({
    name: '自习课噪音监控系统 API',
    version: '2.0.0',
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register',
        profile: 'GET /api/auth/profile'
      },
      users: {
        list: 'GET /api/users',
        create: 'POST /api/users',
        update: 'PUT /api/users/:id',
        delete: 'DELETE /api/users/:id'
      },
      classrooms: {
        list: 'GET /api/classrooms',
        create: 'POST /api/classrooms',
        update: 'PUT /api/classrooms/:id',
        delete: 'DELETE /api/classrooms/:id',
        stats: 'GET /api/classrooms/:id/stats'
      },
      recordings: {
        list: 'GET /api/recordings',
        upload: 'POST /api/recordings/upload',
        detail: 'GET /api/recordings/:id',
        delete: 'DELETE /api/recordings/:id',
        export: 'GET /api/recordings/export/csv'
      },
      analysis: {
        thresholdRecommendation: 'GET /api/analysis/threshold-recommendation',
        learningEfficiency: 'GET /api/analysis/learning-efficiency',
        disciplineReport: 'GET /api/analysis/discipline-report',
        noisePatterns: 'GET /api/analysis/noise-patterns'
      }
    }
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// 系统信息
app.get('/system-info', (req, res) => {
  res.json({
    platform: process.platform,
    nodeVersion: process.version,
    memory: {
      total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
      used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
    },
    uploadDir: {
      exists: fs.existsSync(uploadDir),
      path: path.resolve(uploadDir)
    }
  });
});

// 404处理
app.use((req, res, next) => {
  res.status(404).json({
    error: '路由未找到',
    path: req.path,
    method: req.method
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error('服务器错误:', err);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || '服务器内部错误';
  
  res.status(statusCode).json({
    error: message,
    timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 启动服务器
app.listen(PORT, () => {
  logger.info(`
🚀 自习课噪音监控系统后端已启动!
------------------------------------
📡 本地访问: http://localhost:${PORT}
🌐 API地址: http://localhost:${PORT}/api
📁 文件上传: http://localhost:${PORT}/uploads
📊 系统状态: http://localhost:${PORT}/health
------------------------------------
👤 默认管理员账号: admin / admin123
⚠️  请立即修改默认密码！
`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('收到SIGTERM信号，正在关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('收到SIGINT信号，正在关闭服务器...');
  process.exit(0);
});

module.exports = app;