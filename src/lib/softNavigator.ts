type NavigateFn = (path: string, options?: { replace?: boolean }) => void;

let _navigate: NavigateFn | null = null;

export const registerSoftNavigator = (fn: NavigateFn): void => {
  _navigate = fn;
};

export const softNavigate = (path: string, options?: { replace?: boolean }): void => {
  if (_navigate) {
    _navigate(path, options);
  } else {
    window.location.replace(path);
  }
};
