export type Chunk = {
  chunk: Blob
  chunkFileName: string
}

export type VerifyFile = {
  needUpload: boolean
  uploadList: { chunkFileName: string; size: number }[]
}
