use std::io::Write;

/// 将 Base64 编码的数据写入指定路径（用于前端导出 xlsx 等文件）
#[tauri::command]
pub fn write_file_base64(path: String, data_base64: String) -> Result<String, String> {
    let decoded = base64_decode(&data_base64).map_err(|e| format!("Base64 解码失败: {e}"))?;
    let mut f = std::fs::File::create(&path).map_err(|e| format!("创建文件失败: {e}"))?;
    f.write_all(&decoded).map_err(|e| format!("写入文件失败: {e}"))?;
    Ok(format!("已保存: {}", path))
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    // 标准的 base64 解码，使用 Tauri 内置依赖或手动实现
    let input = input.trim_end_matches('=');
    let mut result = Vec::with_capacity(input.len() * 3 / 4);
    let bytes = input.as_bytes();
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;

    for &b in bytes {
        let val = if b == b'+' { 62 }
            else if b == b'/' { 63 }
            else if b >= b'A' && b <= b'Z' { (b - b'A') as i8 }
            else if b >= b'a' && b <= b'z' { (b - b'a') as i8 + 26 }
            else if b >= b'0' && b <= b'9' { (b - b'0') as i8 + 52 }
            else { continue };
        buf = (buf << 6) | (val as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            result.push((buf >> bits) as u8);
        }
    }

    Ok(result)
}
