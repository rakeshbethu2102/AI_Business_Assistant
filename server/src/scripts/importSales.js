import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { connectDB, getPool } from '../config/db.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const csvPath = path.join(__dirname, '..', '..', 'data', 'ai_bi_assistant_sales_data - GET.csv')

const parseCSV = (csvText) => {
  const rows = csvText.trim().split(/\r?\n/)
  const headers = rows[0].split(',').map((header) => header.trim())

  return rows.slice(1).filter(Boolean).map((row) => {
    const values = row.split(',')
    return headers.reduce((record, header, index) => {
      record[header] = values[index] || null
      return record
    }, {})
  })
}

const normalizeRow = (row) => {
  const quantity = Number(row.Quantity || 0)
  const unitPrice = Number(row.Unit_price || 0)
  const discount = Number(row.Discount_amount || 0)

  return {
    ...row,
    Quantity: quantity,
    Unit_price: unitPrice,
    Discount_amount: discount,
    Revenue: quantity * unitPrice - discount,
  }
}

const run = async () => {
  const database = await connectDB()
  if (!database) throw new Error('MySQL connection is required to import the CSV dataset.')
  const records = parseCSV(fs.readFileSync(csvPath, 'utf8')).map(normalizeRow).filter((record) => record.Transaction_Id)
  let inserted = 0
  let updated = 0
  for (const record of records) {
    const [result] = await getPool().query(`
      INSERT INTO sales_transactions
        (transaction_id, order_date, customer_id, product, category, region, sales_channel, status,
         quantity, unit_price, discount_amount, revenue)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        order_date = VALUES(order_date), customer_id = VALUES(customer_id), product = VALUES(product),
        category = VALUES(category), region = VALUES(region), sales_channel = VALUES(sales_channel), status = VALUES(status),
        quantity = VALUES(quantity), unit_price = VALUES(unit_price),
        discount_amount = VALUES(discount_amount), revenue = VALUES(revenue)
    `, [record.Transaction_Id, record.Order_date, record.Customer_Id, record.Product, record.Category,
      record.Region, record.Sales_channel, record.Status, record.Quantity, record.Unit_price,
      record.Discount_amount, record.Revenue])
    if (result.affectedRows === 1) inserted += 1
    else updated += 1
  }
  console.log(`Imported ${records.length} records: ${inserted} inserted, ${updated} updated.`)
  await getPool().end()
}

run().catch((error) => {
  console.error(`Import failed: ${error.message}`)
  process.exitCode = 1
})
