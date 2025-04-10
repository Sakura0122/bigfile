self.addEventListener('message', async (event) => {
  const file = event.data
  const hashFileName = await getHashFileName(file)
  self.postMessage(hashFileName)
})

/**
 * 获取文件hash名称
 * @param file 文件
 */
const getHashFileName = async (file) => {
  // 1.计算文件hash值
  const hashFile = await calculateFileHash(file)
  // 2.获取文件扩展名
  const ext = file.name.split('.').pop()
  return `${hashFile}.${ext}`
}

/**
 * 计算文件hash值
 * @param file 文件
 */
const calculateFileHash = async (file) => {
  const arrayBuffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
