import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import fp from 'fastify-plugin'

// Dữ liệu mặc định
const defaultData = { books: [], users: [] }

export default fp(async function (fastify) {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const file = join(__dirname, '../../db.json')
  
  const adapter = new JSONFile(file)
  const db = new Low(adapter, defaultData) // Truyền defaultData vào đây
  
  await db.read()
  await db.write()
  
  fastify.decorate('db', db)
})
