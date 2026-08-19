import { type ReactNode } from "react";
import { Provider } from "react-redux";

import "dayjs/locale/en-gb";

import { createTheme, ThemeProvider } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";

import UpdateBanner from "./components/shared/UpdateBanner/UpdateBanner";
import { AuthProvider } from "./context/AuthContext";
import { EncryptionProvider } from "./context/EncryptionContext";
import { InterfacePrefsProvider } from "./context/InterfacePrefsContext";
import { ToastProvider } from "./context/ToastContext";
import AppRoutes from "./routes/Router";
import { useAppSelector } from "./store/hooks";
import { store } from "./store/index";
import { selectThemeMode } from "./store/slices/themeSlice";

// MUI themes that mirror the app's design tokens.
// Primary = accent, paper = card background, text matches token values.
const lightTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#4a665b", light: "#7c9a8e", dark: "#2d5248" },
    background: { paper: "#ffffff", default: "#f3f6f5" },
    text: { primary: "#2d2520", secondary: "#5c4f48", disabled: "#bfb8b4" },
    divider: "#c3d4cf",
  },
  typography: { fontFamily: "'Inter', sans-serif" },
  shape: { borderRadius: 8 },
});

const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#9fbbb3", light: "#c3d4cf", dark: "#7c9a8e" },
    background: { paper: "#1b1e27", default: "#111318" },
    text: { primary: "#e8eaf0", secondary: "#9aa3b8", disabled: "#3d4258" },
    divider: "#2d3245",
  },
  typography: { fontFamily: "'Inter', sans-serif" },
  shape: { borderRadius: 8 },
});

// Reads the app's Redux theme state and provides the matching MUI theme.
// Must sit inside <Provider> so it can call useAppSelector.
function MuiThemeWrapper({ children }: { children: ReactNode }) {
  const mode = useAppSelector(selectThemeMode);
  return <ThemeProvider theme={mode === "dark" ? darkTheme : lightTheme}>{children}</ThemeProvider>;
}

export default function App() {
  return (
    <Provider store={store}>
      <MuiThemeWrapper>
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
          <AuthProvider>
            <EncryptionProvider>
              <InterfacePrefsProvider>
                <ToastProvider>
                  <UpdateBanner />
                  <AppRoutes />
                </ToastProvider>
              </InterfacePrefsProvider>
            </EncryptionProvider>
          </AuthProvider>
        </LocalizationProvider>
      </MuiThemeWrapper>
    </Provider>
  );
}
