import axios from 'axios'
import type { Method, AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import type { Data } from '@/types/global.ts'

const service = axios.create({
  baseURL: 'http://localhost:8080',
})

service.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

service.interceptors.response.use(
  (res) => {
    if (res.data.code === 200) {
      return res.data
    } else if (res.data.code === 208) {
      ElMessage.error(res.data.message || '登录过期，请重新登录')
      return Promise.reject(res.data)
    } else {
      ElMessage.error(res.data.message || '网络异常')
      return Promise.reject(res.data)
    }
  },
  (error) => {
    if (!axios.isCancel(error)) {
      ElMessage.error('请求错误')
    }
    return Promise.reject(error)
  },
)

const baseRequest = (method: Method) => {
  return <T>(url: string, submitData?: object, config?: AxiosRequestConfig) => {
    return service.request<T, Data<T>>({
      url,
      method,
      [method.toLowerCase() === 'get' ? 'params' : 'data']: submitData,
      ...config,
    })
  }
}

const request = {
  get: baseRequest('get'),
  post: baseRequest('post'),
  put: baseRequest('put'),
  delete: baseRequest('delete'),
}

export default request
