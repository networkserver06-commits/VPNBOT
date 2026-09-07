import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AdminApp } from "./pages/Admin";

function Router() {
  return <Switch><Route path="/" component={AdminApp} /><Route path="/assets" component={AdminApp} /><Route path="/services" component={AdminApp} /><Route path="/telegram" component={AdminApp} /><Route component={AdminApp} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
