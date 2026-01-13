const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

class Database {
  constructor() {
    this.db = null;
    this.dbPath = path.join(__dirname, '../noise_monitor.db');
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('✅ 数据库连接成功');
          resolve();
        }
      });
    });
  }

  async initTables() {
    return new Promise((resolve, reject) => {
      // 启用外键约束
      this.db.run('PRAGMA foreign_keys = ON');
      
      // 用户表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          email TEXT,
          real_name TEXT,
          role TEXT NOT NULL DEFAULT 'teacher',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP,
          is_active BOOLEAN DEFAULT 1,
          settings TEXT DEFAULT '{}'
        )
      `);
      
      // 班级表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS classrooms (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          grade TEXT,
          teacher_id INTEGER,
          student_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          settings TEXT DEFAULT '{}',
          FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);
      
      // 录制记录表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS recordings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT NOT NULL,
          original_filename TEXT,
          file_path TEXT NOT NULL,
          file_size INTEGER,
          file_type TEXT,
          duration INTEGER,
          classroom_id TEXT,
          warning_count INTEGER DEFAULT 0,
          threshold INTEGER DEFAULT 80,
          max_decibel REAL,
          avg_decibel REAL,
          noise_types TEXT DEFAULT '[]',
          note TEXT,
          recorded_by INTEGER,
          start_time TIMESTAMP,
          end_time TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          metadata TEXT DEFAULT '{}',
          FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE SET NULL,
          FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
        )
      `);
      
      // 噪音详细记录表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS noise_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          recording_id INTEGER,
          timestamp INTEGER,
          decibel REAL,
          noise_type TEXT,
          confidence REAL,
          frequency_data TEXT,
          FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
        )
      `);
      
      // 警告记录表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS warnings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          recording_id INTEGER,
          warning_time TIMESTAMP,
          decibel REAL,
          duration INTEGER,
          noise_type TEXT,
          FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
        )
      `);
      
      // 系统日志表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS system_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          level TEXT,
          message TEXT,
          user_id INTEGER,
          ip_address TEXT,
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);
      
      resolve();
    });
  }

  async createDefaultAdmin() {
    return new Promise(async (resolve, reject) => {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      this.db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!row) {
          this.db.run(
            `INSERT INTO users (username, password, real_name, role) VALUES (?, ?, ?, ?)`,
            ['admin', hashedPassword, '系统管理员', 'admin'],
            (err) => {
              if (err) {
                reject(err);
              } else {
                console.log('✅ 创建默认管理员账号: admin / admin123');
                resolve();
              }
            }
          );
        } else {
          console.log('ℹ️ 管理员账号已存在');
          resolve();
        }
      });
    });
  }

  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }
}

// 单例模式导出
let dbInstance = null;

async function initDatabase() {
  if (!dbInstance) {
    dbInstance = new Database();
    await dbInstance.connect();
    await dbInstance.initTables();
    await dbInstance.createDefaultAdmin();
  }
  return dbInstance;
}

function getDatabase() {
  if (!dbInstance) {
    throw new Error('数据库未初始化');
  }
  return dbInstance;
}

module.exports = {
  initDatabase,
  getDatabase
};