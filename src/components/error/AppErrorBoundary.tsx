import React from "react";
import { useLocation } from "react-router-dom";
import { AppErrorPage } from "./AppErrorPage";
import { ROUTE_PATHS } from "../../router/paths";

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  resetKey?: string;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundaryInner extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public state: AppErrorBoundaryState = {
    error: null,
  };

  public static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  public componentDidUpdate(previousProps: AppErrorBoundaryProps): void {
    if (
      this.state.error &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null });
    }
  }

  public render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <AppErrorPage
        statusCode={500}
        variant="server"
        title="Hệ thống đang gặp sự cố"
        description="Vui lòng thử lại. Nếu lỗi tiếp tục xảy ra, hãy gửi mã yêu cầu cho quản trị viên."
        details={this.state.error.stack ?? this.state.error.message}
        primaryAction={{ label: "Thử lại", reload: true }}
        secondaryAction={{ label: "Về trang chat", to: ROUTE_PATHS.CHAT }}
      />
    );
  }
}

export const AppErrorBoundary: React.FC<Omit<AppErrorBoundaryProps, "resetKey">> = ({
  children,
}) => {
  const location = useLocation();
  return (
    <AppErrorBoundaryInner resetKey={location.pathname}>
      {children}
    </AppErrorBoundaryInner>
  );
};

export default AppErrorBoundary;
