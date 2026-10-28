import jwt from 'jsonwebtoken'
import { getPool, isDatabaseConnected } from '../config/db.js'

const protect = async (req, res, next) => {
  let token

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1]
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      if (!isDatabaseConnected()) {
        return res.status(503).json({ message: 'MySQL is not connected' })
      }

      const [users] = await getPool().query(
        'SELECT id AS _id, name, email, role FROM users WHERE id = ?',
        [decoded.id]
      )
      req.user = users[0]

      if (!req.user) {
        return res.status(401).json({ message: 'User not found' })
      }

      next()
    } catch (error) {
      return res.status(401).json({ message: 'Not authorized, token failed' })
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' })
  }
}

export { protect }
