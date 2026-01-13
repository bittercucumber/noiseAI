const bcrypt = require('bcryptjs');
const { getDatabase } = require('../config/database');

class User {
  static async create(userData) {
    const db = getDatabase();
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    const result = await db.run(
      `INSERT INTO users (username, password, email, real_name, role, settings) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userData.username,
        hashedPassword,
        userData.email || null,
        userData.real_name || null,
        userData.role || 'teacher',
        JSON.stringify(userData.settings || {})
      ]
    );
    
    return this.findById(result.id);
  }

  static async findById(id) {
    const db = getDatabase();
    return await db.get('SELECT * FROM users WHERE id = ?', [id]);
  }

  static async findByUsername(username) {
    const db = getDatabase();
    return await db.get('SELECT * FROM users WHERE username = ?', [username]);
  }

  static async findAll(options = {}) {
    const db = getDatabase();
    const { page = 1, limit = 20, role } = options;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM users WHERE 1=1';
    const params = [];
    
    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }
    
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return await db.query(query, params);
  }

  static async update(id, userData) {
    const db = getDatabase();
    const updates = [];
    const params = [];
    
    if (userData.password) {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      updates.push('password = ?');
      params.push(hashedPassword);
    }
    
    if (userData.email !== undefined) {
      updates.push('email = ?');
      params.push(userData.email);
    }
    
    if (userData.real_name !== undefined) {
      updates.push('real_name = ?');
      params.push(userData.real_name);
    }
    
    if (userData.role !== undefined) {
      updates.push('role = ?');
      params.push(userData.role);
    }
    
    if (userData.settings !== undefined) {
      updates.push('settings = ?');
      params.push(JSON.stringify(userData.settings));
    }
    
    if (userData.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(userData.is_active);
    }
    
    if (updates.length === 0) {
      return this.findById(id);
    }
    
    params.push(id);
    
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    await db.run(query, params);
    
    return this.findById(id);
  }

  static async delete(id) {
    const db = getDatabase();
    await db.run('DELETE FROM users WHERE id = ?', [id]);
  }

  static async updateLastLogin(id) {
    const db = getDatabase();
    await db.run(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async count() {
    const db = getDatabase();
    const result = await db.get('SELECT COUNT(*) as count FROM users');
    return result.count;
  }

  static async getStats() {
    const db = getDatabase();
    
    const totalUsers = await this.count();
    const activeUsers = await db.get(
      'SELECT COUNT(*) as count FROM users WHERE is_active = 1'
    );
    const usersByRole = await db.query(
      'SELECT role, COUNT(*) as count FROM users GROUP BY role'
    );
    
    return {
      total: totalUsers,
      active: activeUsers.count,
      byRole: usersByRole,
      recentLogins: await db.query(
        `SELECT id, username, real_name, last_login 
         FROM users 
         WHERE last_login IS NOT NULL 
         ORDER BY last_login DESC 
         LIMIT 10`
      )
    };
  }
}

module.exports = User;