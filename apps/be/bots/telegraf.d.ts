import { Context } from 'telegraf';

// Mở rộng Context để thêm session
declare module 'telegraf' {
  interface Context {
    session: any; 
  }
}
