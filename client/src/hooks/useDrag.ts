import { onMounted, onUnmounted, ref, type Ref, toValue } from 'vue'
import { ElMessage } from 'element-plus'
import { MAX_FILE_SIZE } from '@/constant/file.ts'

const useDrag = (uploadContainerRef: Ref<HTMLElement | null>) => {
  const selectedFile = ref<File>()
  const filePreview = ref<{ url: string; type: string }>()

  onMounted(() => {
    const handleDrag = (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
    }

    const handleDrop = (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      checkFile(event.dataTransfer!.files)
      selectedFile.value = event.dataTransfer!.files[0]
      if (selectedFile.value) {
        filePreview.value = {
          url: URL.createObjectURL(selectedFile.value),
          type: selectedFile.value.type,
        }
      }
    }

    const handleClick = () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.style.display = 'none'
      document.body.appendChild(input)
      input.click()
      input.onchange = (event) => {
        selectedFile.value = (event.target as HTMLInputElement).files![0]
        if (selectedFile.value) {
          filePreview.value = {
            url: URL.createObjectURL(selectedFile.value),
            type: selectedFile.value.type,
          }
        }
      }
      document.body.removeChild(input)
    }

    const uploadContainer = toValue(uploadContainerRef)
    if (!uploadContainer) return

    uploadContainer.addEventListener('dragenter', handleDrag)
    uploadContainer.addEventListener('dragover', handleDrag)
    uploadContainer.addEventListener('drop', handleDrop)
    uploadContainer.addEventListener('dragleave', handleDrag)
    uploadContainer.addEventListener('click', handleClick)

    onUnmounted(() => {
      uploadContainer.removeEventListener('dragenter', handleDrag)
      uploadContainer.removeEventListener('dragover', handleDrag)
      uploadContainer.removeEventListener('drop', handleDrop)
      uploadContainer.removeEventListener('dragleave', handleDrag)
      uploadContainer.removeEventListener('click', handleClick)
      URL.revokeObjectURL(filePreview.value!.url)
    })
  })

  const resetFileStatus = () => {
    selectedFile.value = undefined
    filePreview.value = undefined
  }

  return {
    selectedFile,
    filePreview,
    resetFileStatus,
  }
}

function checkFile(files: FileList) {
  const file = files[0]
  if (!file) {
    return ElMessage.error('没有选择任何文件')
  }
  if (file.size > MAX_FILE_SIZE) {
    return ElMessage.error('文件大小不能超过2GB')
  }
  // if (!(file.type.startsWith('image') || file.type.startsWith('video'))) {
  //   return ElMessage.error('文件类型必须是图片或视频')
  // }
}

export default useDrag
