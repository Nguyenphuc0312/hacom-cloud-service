import { useEffect, useState } from "react";

export function useDelayedLoading(isLoading: boolean, delay = 180): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setShow(isLoading),
      isLoading ? delay : 0,
    );

    return () => window.clearTimeout(timer);
  }, [delay, isLoading]);

  return show;
}
