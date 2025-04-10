import express, { Application } from 'express'
import cors from 'cors'
import fs from 'fs-extra'
import { fileURLToPath } from 'node:url'
import path, { dirname } from 'node:path'
import { WriteStream } from 'node:fs'
import { Readable } from 'node:stream'

const app: Application = express()
const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, 'public')
const TEMP_DIR = path.resolve(__dirname, 'temp')
const CHUNK_SIZE = 1024 * 1024 * 100

// 存放合并好的目录
fs.ensureDirSync(PUBLIC_DIR)
// 存放分片的目录
fs.ensureDirSync(TEMP_DIR)

// 中间件
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(PUBLIC_DIR))

// 路由
app.post('/upload/:filename', async (req, res, next) => {
  const { filename } = req.params
  const { chunkFileName, start } = req.query
  const startNumber = typeof start === 'string' ? Number(start) : 0
  const chunkDir = path.resolve(TEMP_DIR, filename)
  const chunkFilePath = path.resolve(chunkDir, chunkFileName as string)
  await fs.ensureDir(chunkDir)
  // 创建文件可写流
  const ws = fs.createWriteStream(chunkFilePath, { start: startNumber, flags: 'a' })
  req.on('aborted', () => ws.close())
  // 使用管道方式把请求体数据写入到文件中
  try {
    await pipeStream(req, ws)
    res.json({
      code: 200,
      message: '上传成功'
    })
  } catch (e) {
    console.log(e)
    next(e)
  }
})

app.get('/merge/:filename', async (req, res, next) => {
  const { filename } = req.params
  try {
    await mergeFileChunk(filename)
    res.json({
      code: 200,
      message: '合并成功'
    })
  } catch (e) {
    console.log(e)
    next(e)
  }
})

app.get('/verify/:filename', async (req, res, next) => {
  const { filename } = req.params
  const filepath = path.resolve(PUBLIC_DIR, filename)
  const isExist = await fs.pathExists(filepath)
  // 已经存在
  if (isExist) {
    res.json({ code: 200, data: { needUpload: false }, message: '文件已存在' })
  }

  const chunksDir = path.resolve(TEMP_DIR, filename)
  const isChunksExist = await fs.pathExists(chunksDir)
  // 存放已经分片上传的对象数组
  let uploadList: { chunkFileName: string, size: number }[] = []
  if (isChunksExist) {
    const chunkFileNames = await fs.readdir(chunksDir)
    uploadList = await Promise.all(chunkFileNames.map(async (chunkFileName) => {
      const { size } = await fs.stat(path.resolve(chunksDir, chunkFileName))
      return { chunkFileName, size }
    }))
  }

  // 没有该文件
  res.json({ code: 200, data: { needUpload: true, uploadList }, message: '文件不存在' })
})

// 写文件
async function pipeStream(req: Readable, ws: WriteStream) {
  return new Promise<void>((resolve, reject) => {
    req.pipe(ws).on('finish', resolve).on('error', reject)
  })
}

// 合并文件
async function mergeFileChunk(filename: string) {
  const chunkDir = path.resolve(TEMP_DIR, filename)
  const chunkFiles = await fs.readdir(chunkDir)
  try {
    // 排序
    chunkFiles.sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]))
    const pipes = chunkFiles.map((chunkFile, index) => {
      return pipeStream(
        fs.createReadStream(path.resolve(chunkDir, chunkFile), { autoClose: true }),
        fs.createWriteStream(path.resolve(PUBLIC_DIR, filename), { start: index * CHUNK_SIZE })
      )
    })
    await Promise.all(pipes)
    await fs.rmdir(chunkDir, { recursive: true })
  } catch (e) {
    console.log(e)
  }
}


// 启动服务
app.listen('8080', () => {
  console.log('Server is running on http://localhost:8080')
})
