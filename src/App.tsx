import { Provider } from "react-redux";

import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";

import { AuthProvider } from "./context/AuthContext";
import { InterfacePrefsProvider } from "./context/InterfacePrefsContext";
import { ToastProvider } from "./context/ToastContext";
import AppRoutes from "./routes/Router";
import { store } from "./store/index";

export default function App() {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Provider store={store}>
        <AuthProvider>
          <InterfacePrefsProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </InterfacePrefsProvider>
        </AuthProvider>
      </Provider>
    </LocalizationProvider>
  );
}
