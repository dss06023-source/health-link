import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// SINGLE=1 이면 시연 링크용 단일 HTML 파일로 빌드한다.
export default defineConfig({
  plugins: process.env.SINGLE ? [react(), viteSingleFile()] : [react()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
})
