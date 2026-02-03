/**
 * @fileoverview Main App component
 * Router configuration và providers
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LoginPage, RegisterPage, ForgotPasswordPage, ChatPage } from "./pages";
import { ProtectedRoute, GuestRoute } from "./components/auth";
import { ToastProvider } from "./components/ui";

function App() {
  return (
    <BrowserRouter>
      {/* Toast notifications */}
      <ToastProvider />

      <Routes>
        {/* Public routes - chỉ cho guest */}
        <Route
          path="/login"
          element={
            <GuestRoute>
              <LoginPage />
            </GuestRoute>
          }
        />
        <Route
          path="/register"
          element={
            <GuestRoute>
              <RegisterPage />
            </GuestRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <GuestRoute>
              <ForgotPasswordPage />
            </GuestRoute>
          }
        />

        {/* Protected routes - yêu cầu đăng nhập */}
        <Route
          path="/chat/:conversationId?"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />

        {/* Redirect root to chat */}
        <Route path="/" element={<Navigate to="/chat" replace />} />

        {/* 404 fallback */}
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
