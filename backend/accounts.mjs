// Tài khoản dùng phiên ngẫu nhiên phía máy chủ, tách biệt hoàn toàn quyền admin.
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
const unhex = value => Uint8Array.from(value.match(/.{2}/g) || [], n => parseInt(n, 16));
const lifetime = 10 * 86400;
export function normalizeFullName(value) {
  if(typeof value!=='string' || /[\p{Cc}\p{Cf}]/u.test(value)) return null;
  const name=value.normalize('NFC').trim().replace(/\s+/gu,' ');
  if(name.length<2 || name.length>80 || !/^[\p{L}\p{M} .’'\-]+$/u.test(name) || (name.match(/\p{L}/gu)||[]).length<2) return null;
  return name;
}
const publicUser = user => ({id:user.id,username:user.username,fullName:user.full_name || ''});
export const tokenHash = async token => hex(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
export async function passwordHash(password, salt, secret) {
  // Pepper ở secret Worker: chỉ lấy database cũng chưa đủ để thử mật khẩu offline.
  const pepper = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const material = await crypto.subtle.sign('HMAC', pepper, encoder.encode(password));
  const key = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:unhex(salt),iterations:100000,hash:'SHA-256'}, key, 256));
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function currentUser(request, env, now) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!/^[0-9a-f]{64}$/.test(token || '')) return null;
  const hash = await tokenHash(token);
  return env.DB.prepare('SELECT u.id,u.username,p.full_name,s.expires_at FROM user_sessions s JOIN users u ON u.id=s.user_id LEFT JOIN user_profiles p ON p.user_id=u.id WHERE s.token_hash=?1 AND s.expires_at>?2').bind(hash, now).first();
}
async function body(request, max=2048) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw Error('Invalid content type');
  const reader=request.body?.getReader(); if(!reader) throw Error('Missing body');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('Too large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
function validData(data) {
  return data && Array.isArray(data.tasks) && Array.isArray(data.folders) && data.tasks.length<=2000 && data.folders.length<=200
    && data.tasks.every(t=>t && typeof t.id==='string' && t.id.length<=100 && typeof t.text==='string' && t.text.length<=200 && typeof t.completed==='boolean')
    && data.folders.every(f=>f && typeof f.id==='string' && f.id.length<=100 && typeof f.name==='string' && f.name.length<=100);
}
export async function accountRoute(request, env, path, now, reply, limited) {
  if (!path.startsWith('/auth/') && path!=='/account/data') return null;
  if(!env.PASSWORD_PEPPER || env.PASSWORD_PEPPER.length<32)return reply({error:'Máy chủ tài khoản chưa sẵn sàng.'},503);
  if (request.headers.get('Origin')!==env.ALLOWED_ORIGIN) return reply({error:'Origin không hợp lệ.'},403);
  if (['/auth/register','/auth/login'].includes(path)) {
    if(request.method!=='POST')return reply({error:'Method không hợp lệ.'},405);
    if(await limited(request,env,'user-login',15,900,now))return reply({error:'Thử lại sau 15 phút.'},429);
    let data;try{data=await body(request);}catch{return reply({error:'Dữ liệu không hợp lệ.'},400);}
    const username=typeof data?.username==='string'?data.username.trim().toLowerCase():'';
    const password=data?.password;
    if(!/^[a-z0-9_.]{3,32}$/.test(username)||typeof password!=='string'||password.length<10||password.length>128)
      return reply({error:'Tên đăng nhập gồm 3–32 chữ không dấu, số, dấu . hoặc _. Mật khẩu từ 10–128 ký tự.'},400);
    let user=await env.DB.prepare('SELECT u.id,u.username,u.password_hash,u.password_salt,p.full_name FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.username=?1').bind(username).first();
    if(path==='/auth/register'){
      const fullName=normalizeFullName(data.fullName);
      if(!fullName)return reply({error:'Nhập họ và tên từ 2–80 ký tự, chỉ gồm chữ, khoảng trắng, dấu chấm, nháy hoặc gạch nối.'},400);
      if(await limited(request,env,'user-register',5,3600,now))return reply({error:'Thử đăng ký lại sau 1 giờ.'},429);
      if(user)return reply({error:'Tên đăng nhập đã được sử dụng.'},409);
      const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
      const hash=await passwordHash(password,salt,env.PASSWORD_PEPPER);
      user={id:crypto.randomUUID(),username,full_name:fullName};
      try {
        await env.DB.batch([
          env.DB.prepare('INSERT INTO users(id,username,password_hash,password_salt,created_at) VALUES(?1,?2,?3,?4,?5)').bind(user.id,username,hash,salt,now),
          env.DB.prepare('INSERT INTO user_profiles(user_id,full_name) VALUES(?1,?2)').bind(user.id,fullName),
          env.DB.prepare('INSERT INTO user_data(user_id,updated_at) VALUES(?1,?2)').bind(user.id,now)
        ]);
      } catch {return reply({error:'Không thể tạo tài khoản. Hãy thử tên khác.'},409);}
    }else{
      const hash=await passwordHash(password,user?.password_salt || '00'.repeat(16),env.PASSWORD_PEPPER);
      if(!user||!equal(hash,user.password_hash))return reply({error:'Tên đăng nhập hoặc mật khẩu không đúng.'},401);
    }
    const token=hex(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare('INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES(?1,?2,?3)').bind(await tokenHash(token),user.id,now+lifetime).run();
    return reply({token,user:publicUser(user),expiresAt:(now+lifetime)*1000},path==='/auth/register'?201:200);
  }
  const user=await currentUser(request,env,now);
  if(!user)return reply({error:'Vui lòng đăng nhập lại.'},401);
  if(path==='/auth/me' && request.method==='GET')return reply({user:publicUser(user),expiresAt:user.expires_at*1000});
  if(path==='/auth/profile' && request.method==='POST'){
    if(await limited(request,env,'user-profile',20,300,now))return reply({error:'Cập nhật quá nhanh. Hãy thử lại sau.'},429);
    let data;try{data=await body(request);}catch{return reply({error:'Dữ liệu không hợp lệ.'},400);}
    const fullName=normalizeFullName(data?.fullName);
    if(!fullName)return reply({error:'Họ và tên phải gồm 2–80 ký tự chữ và khoảng trắng; có thể dùng dấu chấm, nháy hoặc gạch nối.'},400);
    await env.DB.prepare('INSERT INTO user_profiles(user_id,full_name) VALUES(?1,?2) ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name').bind(user.id,fullName).run();
    return reply({user:publicUser({...user,full_name:fullName})});
  }
  if(path==='/auth/logout' && request.method==='POST'){
    await env.DB.prepare('DELETE FROM user_sessions WHERE token_hash=?1').bind(await tokenHash(request.headers.get('Authorization').replace(/^Bearer /,''))).run();
    return reply({loggedOut:true});
  }
  if(path==='/account/data'){
    if(request.method==='GET'){
      const row=await env.DB.prepare('SELECT data,version FROM user_data WHERE user_id=?1').bind(user.id).first();
      return reply({data:row?JSON.parse(row.data):{tasks:[],folders:[]},version:row?.version || 0});
    }
    if(request.method==='POST'){
      if(await limited(request,env,'user-save',120,300,now))return reply({error:'Lưu quá nhanh, hãy thử lại sau.'},429);
      let data;try{data=await body(request,262144);}catch{return reply({error:'Dữ liệu quá lớn hoặc không hợp lệ (tối đa 256 KB).'},400);}
      if(!Number.isSafeInteger(data?.version)||data.version<0||!validData(data.data))return reply({error:'Danh sách công việc không hợp lệ.'},400);
      const row=await env.DB.prepare('UPDATE user_data SET data=?1,version=version+1,updated_at=?2 WHERE user_id=?3 AND version=?4 RETURNING version').bind(JSON.stringify(data.data),now,user.id,data.version).first();
      if(!row)return reply({error:'Dữ liệu đã thay đổi ở thiết bị khác. Giữ bản trên máy và tải lại trước khi sửa tiếp.'},409);
      return reply({version:row.version});
    }
  }
  return reply({error:'Không tìm thấy chức năng.'},404);
}
