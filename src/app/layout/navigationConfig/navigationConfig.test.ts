import { commandRouteItems, navItems, pickSelectedMenuKey, resolveNavigationContext } from './navigationConfig';

describe('operations navigation', () => {
  it('contains only operations and user-support destinations', () => {
    const labels = navItems.map((item) => item.label.toLocaleLowerCase('vi-VN')).join(' ');
    const routes = navItems.map((item) => item.route);

    expect(labels).not.toMatch(/vai trò|phân quyền|nhân sự hr|truy cập admin/);
    expect(routes).not.toEqual(expect.arrayContaining(['/authority', '/hr-employees', '/access-requests']));
  });

  it('does not offer removed authority features through global search', () => {
    const searchTerms = commandRouteItems
      .flatMap((item) => [item.label, item.description, ...item.keywords])
      .join(' ')
      .toLocaleLowerCase('vi-VN');

    expect(searchTerms).not.toMatch(/permission|authority|vai trò|phân quyền/);
  });

  it('maps user detail and system routes to operations context', () => {
    expect(pickSelectedMenuKey('/users/00000000-0000-4000-8000-000000000001')).toBe('user-operations');
    expect(resolveNavigationContext('/logs').title).toBe('Logs & sự cố');
  });
});
