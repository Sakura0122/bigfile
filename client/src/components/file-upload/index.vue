<script setup lang="ts">
import { Upload } from '@element-plus/icons-vue'
import { computed, ref, useTemplateRef } from 'vue'
import useDrag from '@/hooks/useDrag.ts'
import { ElMessage } from 'element-plus'
import { CHUNK_SIZE } from '@/constant/file.ts'
import type { Chunk, VerifyFile } from '@/types/file.ts'
import request from '@/utils/request.ts'
import axios from 'axios'

defineOptions({ name: 'FileUpload ' })

const UploadStatus = {
  NOT_STARTED: 'NOT_STARTED',
  UPLOADING: 'UPLOADING',
  PAUSED: 'PAUSED',
} as const

// 拖拽上传
const uploadContainerRef = useTemplateRef('uploadContainer')
const { selectedFile, filePreview, resetFileStatus } = useDrag(uploadContainerRef)

// 上传进度
const uploadProgress = ref<Record<string, number>>()
const totalProgress = computed(() => {
  if (!uploadProgress.value) return 0
  const total = Object.values(uploadProgress.value).reduce((acc, cur) => acc + cur, 0)
  return Math.round(total / Object.keys(uploadProgress.value).length)
})

// 暂停上传
const uploadStatus = ref<keyof typeof UploadStatus>(UploadStatus.NOT_STARTED)
const abortControllers = ref<AbortController[]>([])

// 上传文件
const isLoading = ref(false)
const handleUpload = async () => {
  if (!selectedFile.value) {
    return ElMessage.error('请先选择文件')
  }
  uploadStatus.value = UploadStatus.UPLOADING
  isLoading.value = true
  const fileNameWorker = new Worker('/fileNameWorker.js')
  fileNameWorker.postMessage(selectedFile.value)
  fileNameWorker.onmessage = (event) => {
    fileNameWorker.terminate()
    const fileName = event.data
    isLoading.value = false
    uploadFile(fileName, selectedFile.value!)
    fileNameWorker.terminate()
  }
  // const hashFileName = await getHashFileName(selectedFile.value)
  // await uploadFile(hashFileName, selectedFile.value)
}

// 暂停上传
const handlePauseUpload = () => {
  uploadStatus.value = UploadStatus.PAUSED
  abortControllers.value.forEach((controller) => controller.abort())
  abortControllers.value = []
}

// 重置
const reset = () => {
  resetFileStatus()
  uploadProgress.value = undefined
  uploadStatus.value = UploadStatus.NOT_STARTED
}

/**
 * 上传文件
 * @param fileName 文件名
 * @param file 文件
 */
const uploadFile = async (fileName: string, file: File) => {
  // 0.校验服务器是否已经存在该文件
  const res = await request.get<VerifyFile>(`/verify/${fileName}`)
  if (!res.data.needUpload) {
    reset()
    return ElMessage.success('文件已存在，秒传成功')
  }
  // 1.把文件切片
  const chunks = createFileChunks(fileName, file)
  const newAbortControllers: AbortController[] = []
  // 2.并行上传
  const requests = chunks.map(({ chunk, chunkFileName }) => {
    const controller = new AbortController()
    newAbortControllers.push(controller)
    // 判断当前分片是否已经上传过服务器
    const existingChunk = res.data.uploadList.find((uploadList) => {
      return chunkFileName === uploadList.chunkFileName
    })
    if (existingChunk) {
      // 已经上传过一部分 或者全部传完
      const uploadSize = existingChunk.size
      const remainingChunk = chunk.slice(uploadSize)
      if (remainingChunk.size === 0) {
        uploadProgress.value = { ...uploadProgress.value, [chunkFileName]: 100 }
        return Promise.resolve()
      }
      uploadProgress.value = { ...uploadProgress.value, [chunkFileName]: (uploadSize * 100) / chunk.size }
      return createRequest(fileName, chunkFileName, remainingChunk, controller.signal, uploadSize, chunk.size)
    } else {
      return createRequest(fileName, chunkFileName, chunk, controller.signal, 0, chunk.size)
    }
  })
  abortControllers.value = newAbortControllers
  try {
    // 并行上传分片
    await Promise.all(requests)
    // 全部上传完毕 发送合并的请求
    await request.get(`/merge/${fileName}`)
    ElMessage.success('上传成功')
    reset()
  } catch (e) {
    if (axios.isCancel(e)) {
      ElMessage.warning('上传暂停')
    } else {
      console.log('上传出错' + e)
      ElMessage.error('上传失败')
    }
  }
}

/**
 * 切片文件
 * @param fileName 文件名
 * @param file 文件
 */
const createFileChunks = (fileName: string, file: File) => {
  // 分片数组
  let chunks: Chunk[] = []
  // 计算一共要切成多少片
  let count = Math.ceil(file.size / CHUNK_SIZE)
  for (let i = 0; i < count; i++) {
    const start = i * CHUNK_SIZE
    const end = start + CHUNK_SIZE
    const chunk = file.slice(start, end)
    chunks.push({ chunk, chunkFileName: `${fileName}-${i}` })
  }
  return chunks
}

/**
 * 上传分片
 * @param fileName 文件名
 * @param chunkFileName 切片文件名
 * @param chunk 切片文件
 * @param signal
 * @param start 起始位置
 * @param chunkSize 切片总大小
 */
const createRequest = (
  fileName: string,
  chunkFileName: string,
  chunk: Blob,
  signal: AbortSignal,
  start: number,
  chunkSize: number,
) => {
  return request.post(`/upload/${fileName}`, chunk, {
    headers: { 'Content-Type': 'application/octet-stream' },
    params: { chunkFileName, start },
    onUploadProgress(progressEvent) {
      const percentCompleted = Math.round(((progressEvent.loaded + start) * 100) / chunkSize)
      uploadProgress.value = { ...uploadProgress.value, [chunkFileName]: percentCompleted }
    },
    signal,
  })
}
</script>

<template>
  <div class="upload-container" ref="uploadContainer">
    <el-icon v-if="!selectedFile">
      <Upload />
    </el-icon>
    <template v-else>
      <img v-if="filePreview?.type.startsWith('image')" :src="filePreview?.url" alt="" />
      <video v-else-if="filePreview?.type.startsWith('video')" :src="filePreview?.url" alt="" :controls="true" />
    </template>
  </div>
  {{ isLoading ? '计算文件名中' : '' }}
  <el-button @click="handleUpload" v-if="uploadStatus === UploadStatus.NOT_STARTED">上传</el-button>
  <el-button @click="handlePauseUpload" v-else-if="uploadStatus === UploadStatus.UPLOADING">暂停</el-button>
  <el-button @click="handleUpload" v-else-if="uploadStatus === UploadStatus.PAUSED">继续</el-button>
  <div class="progress" v-if="uploadProgress">
    <el-progress
      text-inside
      :stroke-width="26"
      :percentage="totalProgress"
      :status="totalProgress === 100 ? 'success' : 'warning'"
    />
  </div>
</template>

<style scoped lang="scss">
.upload-container {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #d9d9d9;
  background-color: #fafafa;
  width: 300px;
  height: 300px;
  font-size: 60px;

  &:hover {
    border-color: #40a9ff;
  }

  img {
    width: 100%;
    height: 100%;
  }

  video {
    width: 100%;
    height: 100%;
  }
}

.progress {
  width: 300px;

  .el-progress--line {
    margin-bottom: 15px;
  }
}
</style>
