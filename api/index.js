import app from '../server/src/server.js'
import connectDB from '../server/src/config/db.js'

export default async function handler(req, res) {
  await connectDB()
  return app(req, res)
}
