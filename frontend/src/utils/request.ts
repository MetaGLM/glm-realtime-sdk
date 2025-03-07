import axios, { AxiosRequestConfig } from 'axios';
import { message } from 'antd';

const axiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 300000,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosInstance.interceptors.request.use(
  config => {
    // 在这里可以添加 token 或者其他通用请求参数
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.token = token;
    }
    return config;
  },
  error => Promise.reject(error),
);

axiosInstance.interceptors.response.use(
  res => {
    if (res.status < 300) {
      if (res.status === 200) {
        return res.data;
      }
    }
    // 在这里可以对响应数据进行处理
    return res;
  },
  error => {
    // 统一处理错误
    if (error.response) {
      // 服务器返回的错误
      console.error('Server error:', error.response);
      if (error.response.status === 401) {
        message.error('token已过期，请重新登录');
      }
    } else if (error.request) {
      // 请求发送失败
      console.error('Request error:', error.request);
    } else {
      // 其他错误
      console.error('Error:', error.message);
    }
    return Promise.reject(error);
  },
);

export default async function request<Data, Response>(
  url: string,
  method: string,
  data: Data,
  config: AxiosRequestConfig = {},
) {
  return axiosInstance.request<null, Response, Data>({
    url,
    data,
    method,
    ...config,
  });
}
