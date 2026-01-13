const { getDatabase } = require('../config/database');
const moment = require('moment');

class Recording {
  static async create(recordingData) {
    const db = getDatabase();
    
    const result = await db.run(
      `INSERT INTO recordings (
        filename, original_filename, file_path, file_size, file_type,
        duration, classroom_id, warning_count, threshold, max_decibel,
        avg_decibel, noise_types, note, recorded_by, start_time, end_time, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recordingData.filename,
        recordingData.original_filename || recordingData.filename,
        recordingData.file_path,
        recordingData.file_size || 0,
        recordingData.file_type || 'audio/webm',
        recordingData.duration || 0,
        recordingData.classroom_id || null,
        recordingData.warning_count || 0,
        recordingData.threshold || 80,
        recordingData.max_decibel || 0,
        recordingData.avg_decibel || 0,
        JSON.stringify(recordingData.noise_types || []),
        recordingData.note || '',
        recordingData.recorded_by || null,
        recordingData.start_time || new Date().toISOString(),
        recordingData.end_time || new Date().toISOString(),
        JSON.stringify(recordingData.metadata || {})
      ]
    );
    
    return this.findById(result.id);
  }

  static async findById(id) {
    const db = getDatabase();
    const recording = await db.get(`
      SELECT r.*, 
             c.name as classroom_name,
             u.real_name as recorded_by_name,
             u.username as recorded_by_username
      FROM recordings r
      LEFT JOIN classrooms c ON r.classroom_id = c.id
      LEFT JOIN users u ON r.recorded_by = u.id
      WHERE r.id = ?
    `, [id]);
    
    if (recording) {
      recording.noise_types = JSON.parse(recording.noise_types || '[]');
      recording.metadata = JSON.parse(recording.metadata || '{}');
    }
    
    return recording;
  }

  static async findAll(options = {}) {
    const db = getDatabase();
    const {
      page = 1,
      limit = 20,
      classroom_id,
      start_date,
      end_date,
      min_warnings,
      max_warnings,
      user_id
    } = options;
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT r.*, 
             c.name as classroom_name,
             u.real_name as recorded_by_name
      FROM recordings r
      LEFT JOIN classrooms c ON r.classroom_id = c.id
      LEFT JOIN users u ON r.recorded_by = u.id
      WHERE 1=1
    `;
    const params = [];
    
    if (classroom_id) {
      query += ' AND r.classroom_id = ?';
      params.push(classroom_id);
    }
    
    if (start_date) {
      query += ' AND DATE(r.start_time) >= ?';
      params.push(start_date);
    }
    
    if (end_date) {
      query += ' AND DATE(r.start_time) <= ?';
      params.push(end_date);
    }
    
    if (min_warnings !== undefined) {
      query += ' AND r.warning_count >= ?';
      params.push(min_warnings);
    }
    
    if (max_warnings !== undefined) {
      query += ' AND r.warning_count <= ?';
      params.push(max_warnings);
    }
    
    if (user_id) {
      query += ' AND r.recorded_by = ?';
      params.push(user_id);
    }
    
    query += ' ORDER BY r.start_time DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const recordings = await db.query(query, params);
    
    // 解析JSON字段
    return recordings.map(rec => ({
      ...rec,
      noise_types: JSON.parse(rec.noise_types || '[]'),
      metadata: JSON.parse(rec.metadata || '{}')
    }));
  }

  static async update(id, recordingData) {
    const db = getDatabase();
    const updates = [];
    const params = [];
    
    if (recordingData.note !== undefined) {
      updates.push('note = ?');
      params.push(recordingData.note);
    }
    
    if (recordingData.warning_count !== undefined) {
      updates.push('warning_count = ?');
      params.push(recordingData.warning_count);
    }
    
    if (recordingData.classroom_id !== undefined) {
      updates.push('classroom_id = ?');
      params.push(recordingData.classroom_id);
    }
    
    params.push(id);
    
    if (updates.length > 0) {
      const query = `UPDATE recordings SET ${updates.join(', ')} WHERE id = ?`;
      await db.run(query, params);
    }
    
    return this.findById(id);
  }

  static async delete(id) {
    const db = getDatabase();
    // 获取文件路径以便删除物理文件
    const recording = await this.findById(id);
    
    await db.run('DELETE FROM recordings WHERE id = ?', [id]);
    
    return recording;
  }

  static async addNoiseRecords(recordingId, noiseRecords) {
    const db = getDatabase();
    
    for (const record of noiseRecords) {
      await db.run(
        `INSERT INTO noise_records (recording_id, timestamp, decibel, noise_type, confidence, frequency_data)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          recordingId,
          record.timestamp,
          record.decibel,
          record.noise_type || null,
          record.confidence || null,
          JSON.stringify(record.frequency_data || {})
        ]
      );
    }
  }

  static async addWarning(recordingId, warningData) {
    const db = getDatabase();
    
    await db.run(
      `INSERT INTO warnings (recording_id, warning_time, decibel, duration, noise_type)
       VALUES (?, ?, ?, ?, ?)`,
      [
        recordingId,
        warningData.warning_time || new Date().toISOString(),
        warningData.decibel,
        warningData.duration || 0,
        warningData.noise_type || null
      ]
    );
  }

  static async getNoiseRecords(recordingId, limit = 1000) {
    const db = getDatabase();
    return await db.query(
      `SELECT * FROM noise_records 
       WHERE recording_id = ? 
       ORDER BY timestamp 
       LIMIT ?`,
      [recordingId, limit]
    );
  }

  static async getWarnings(recordingId) {
    const db = getDatabase();
    return await db.query(
      `SELECT * FROM warnings 
       WHERE recording_id = ? 
       ORDER BY warning_time`,
      [recordingId]
    );
  }

  static async getStats(options = {}) {
    const db = getDatabase();
    const { classroom_id, start_date, end_date } = options;
    
    let query = `
      SELECT 
        COUNT(*) as total_recordings,
        SUM(file_size) as total_size,
        SUM(duration) as total_duration,
        AVG(warning_count) as avg_warnings,
        MAX(warning_count) as max_warnings,
        AVG(threshold) as avg_threshold,
        MIN(start_time) as first_recording,
        MAX(start_time) as last_recording
      FROM recordings
      WHERE 1=1
    `;
    const params = [];
    
    if (classroom_id) {
      query += ' AND classroom_id = ?';
      params.push(classroom_id);
    }
    
    if (start_date) {
      query += ' AND DATE(start_time) >= ?';
      params.push(start_date);
    }
    
    if (end_date) {
      query += ' AND DATE(start_time) <= ?';
      params.push(end_date);
    }
    
    return await db.get(query, params);
  }

  static async getDailyStats(days = 30) {
    const db = getDatabase();
    
    return await db.query(`
      SELECT 
        DATE(start_time) as date,
        COUNT(*) as recordings,
        SUM(warning_count) as total_warnings,
        AVG(warning_count) as avg_warnings,
        AVG(threshold) as avg_threshold
      FROM recordings
      WHERE start_time >= DATE('now', ?)
      GROUP BY DATE(start_time)
      ORDER BY date
    `, [`-${days} days`]);
  }

  static async getTopNoisyRecordings(limit = 10) {
    const db = getDatabase();
    
    return await db.query(`
      SELECT r.*, c.name as classroom_name
      FROM recordings r
      LEFT JOIN classrooms c ON r.classroom_id = c.id
      ORDER BY r.warning_count DESC
      LIMIT ?
    `, [limit]);
  }

  static async count() {
    const db = getDatabase();
    const result = await db.get('SELECT COUNT(*) as count FROM recordings');
    return result.count;
  }

  static async getFileSizeStats() {
    const db = getDatabase();
    
    const totalSize = await db.get('SELECT SUM(file_size) as total FROM recordings');
    const avgSize = await db.get('SELECT AVG(file_size) as avg FROM recordings');
    const byType = await db.query(
      'SELECT file_type, COUNT(*) as count, SUM(file_size) as total_size FROM recordings GROUP BY file_type'
    );
    
    return {
      total: totalSize.total || 0,
      avg: avgSize.avg || 0,
      byType
    };
  }

  static async exportToCSV(options = {}) {
    const db = getDatabase();
    const recordings = await this.findAll({ ...options, limit: 10000 });
    
    // CSV头部
    const headers = [
      'ID',
      '文件名',
      '班级',
      '警告次数',
      '阈值(dB)',
      '最大分贝',
      '平均分贝',
      '持续时间(秒)',
      '文件大小',
      '开始时间',
      '结束时间',
      '备注'
    ].join(',');
    
    // CSV数据行
    const rows = recordings.map(rec => [
      rec.id,
      `"${rec.filename}"`,
      `"${rec.classroom_name || '无班级'}"`,
      rec.warning_count,
      rec.threshold,
      rec.max_decibel,
      rec.avg_decibel,
      rec.duration,
      rec.file_size,
      `"${rec.start_time}"`,
      `"${rec.end_time}"`,
      `"${(rec.note || '').replace(/"/g, '""')}"`
    ].join(','));
    
    return [headers, ...rows].join('\n');
  }
}

module.exports = Recording;