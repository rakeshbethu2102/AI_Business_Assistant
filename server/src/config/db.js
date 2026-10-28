import mysql from 'mysql2/promise'

let pool = null
let connected = false

const getPool = () => {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'ai_bi_assistant',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    })
  }

  return pool
}

const connectDB = async () => {
  try {
    const database = getPool()
    await database.query('SELECT 1')
    await database.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'manager', 'user') NOT NULL DEFAULT 'user',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `)
    await database.query(`
      CREATE TABLE IF NOT EXISTS sales_transactions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        transaction_id VARCHAR(120) NOT NULL UNIQUE,
        order_date VARCHAR(40) NULL,
        customer_id VARCHAR(120) NULL,
        product VARCHAR(255) NULL,
        category VARCHAR(120) NULL,
        region VARCHAR(120) NULL,
        sales_channel VARCHAR(120) NULL,
        status VARCHAR(80) NULL,
        quantity DECIMAL(18, 4) NOT NULL DEFAULT 0,
        unit_price DECIMAL(18, 4) NOT NULL DEFAULT 0,
        discount_amount DECIMAL(18, 4) NOT NULL DEFAULT 0,
        revenue DECIMAL(18, 4) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_region (region),
        INDEX idx_category (category),
        INDEX idx_order_date (order_date)
      ) ENGINE=InnoDB
    `)
    connected = true
    console.log(`MySQL connected: ${process.env.MYSQL_HOST || '127.0.0.1'}`)
    return database
  } catch (error) {
    connected = false
    console.warn(`MySQL connection error: ${error.message}. Continuing in CSV fallback mode.`)
    return null
  }
}

const isDatabaseConnected = () => connected

export { connectDB, getPool, isDatabaseConnected }
export default connectDB
