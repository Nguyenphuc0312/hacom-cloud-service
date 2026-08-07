import { describe, expect, it } from 'vitest';
import { extractCloudLinks } from './extractCloudLinks';

describe('extractCloudLinks', () => {
  it('lấy link từ HTML của Tiptap mà không nhân đôi (href + phần chữ hiển thị)', () => {
    const links = extractCloudLinks([
      {
        id: 'm1',
        content:
          '<p><a target="_blank" rel="noopener noreferrer" href="https://www.msn.com/en-us">https://www.msn.com/en-us</a></p>',
      },
    ]);

    expect(links).toHaveLength(1);
    expect(links[0].url).toBe('https://www.msn.com/en-us');
    expect(links[0].host).toBe('msn.com');
  });

  it('vẫn bắt được link trong văn bản thuần', () => {
    const links = extractCloudLinks([
      { id: 'm1', content: 'xem ở https://drive.google.com/abc nhé' },
    ]);

    expect(links.map((l) => l.url)).toEqual(['https://drive.google.com/abc']);
  });

  it('bỏ dấu câu dính cuối câu', () => {
    const links = extractCloudLinks([
      { id: 'm1', content: 'vào https://hrm.hacomholdings.com.vn.' },
    ]);

    expect(links[0].url).toBe('https://hrm.hacomholdings.com.vn');
  });

  it('không lặp lại cùng một link gửi nhiều lần', () => {
    const links = extractCloudLinks([
      { id: 'm1', content: 'https://example.com/a' },
      { id: 'm2', content: 'https://example.com/a' },
    ]);

    expect(links).toHaveLength(1);
  });

  it('bỏ qua nội dung rỗng và chuỗi không phải URL hợp lệ', () => {
    expect(extractCloudLinks([{ id: 'm1', content: '' }])).toEqual([]);
    expect(extractCloudLinks([{ id: 'm2', content: null }])).toEqual([]);
    expect(extractCloudLinks([{ id: 'm3', content: 'không có link' }])).toEqual([]);
  });

  it('link mới nhất đứng đầu', () => {
    const links = extractCloudLinks([
      { id: 'cu', content: 'https://example.com/cu' },
      { id: 'moi', content: 'https://example.com/moi' },
    ]);

    expect(links[0].messageId).toBe('moi');
  });
});
