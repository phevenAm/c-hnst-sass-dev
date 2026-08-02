import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import ImageBlurBlock from "@components/shared/ImageBlurBlock/ImageBlurBlock";
import { useAuth } from "@context/AuthContext";

import styles from "./LoginPage.module.scss";

const LogoIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 22V12" />
    <path d="M12 12C12 7 7 3 2 3c0 5 4 9 10 9z" />
    <path d="M12 12C12 7 17 3 22 3c0 5-4 9-10 9z" />
  </svg>
);

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, loading, isAuthenticated, isAdmin, error } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate(isAdmin ? "/admin" : "/dashboard", { replace: true });
    }
  }, [loading, isAuthenticated, isAdmin, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch {
      // error is set in AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoSignIn = async (role: "admin" | "client") => {
    setSubmitting(true);
    try {
      await signIn(
        role === "admin" ? "demo-admin@honest.com" : "demo-client@honest.com",
        role === "admin" ? "DemoAdmin2026" : "DemoClient2026",
      );
    } catch {
      // error is set in AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const isLoading = submitting || loading;

  return (
    <main className={`${styles.page} page`}>
      <ImageBlurBlock
        imageUrl="/pexels-amirali-shaghaghi-18428647.jpg"
        photographer="Amirali Shaghaghi"
        sourceLabel="Pexels"
        creditUrl="https://www.pexels.com/@amirali-shaghaghi-479660570/"
      />
      <div className={`${styles.container} container`}>
        <div className={styles.logoWrap}>
          <div className={styles.logoMark}>
            <LogoIcon />
          </div>
          <h1 className={styles.logoTitle}>WithMe</h1>
          <p className={styles.logoSub}>A safe space for your journey</p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.heading}>Welcome back</h2>

          {error && (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={styles.input}
              />
            </div>

            <div className={`${styles.field} ${styles.fieldLast}`}>
              <label htmlFor="password" className={styles.label}>
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={styles.input}
              />
            </div>

            <button type="submit" disabled={isLoading || !email || !password} className={styles.submitBtn}>
              {isLoading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className={styles.footer}>
            Don't have an account?{" "}
            <Link to="/signup" className={styles.link}>
              Sign up
            </Link>
          </p>
          <p className={styles.footer}>
            Are you a therapist?{" "}
            <Link to="/register" className={styles.link}>
              Register your practice
            </Link>
          </p>
        </div>

        <div className={styles.demoSection}>
          <p className={styles.demoDivider}>or try a demo account</p>
          <div className={styles.demoCards}>
            <button
              type="button"
              className={styles.demoCard}
              onClick={() => handleDemoSignIn("admin")}
              disabled={isLoading}
            >
              <span className={styles.demoRole}>Therapist view</span>
              <span className={styles.demoDesc}>Manage clients, sessions &amp; check-ins</span>
            </button>
            <button
              type="button"
              className={styles.demoCard}
              onClick={() => handleDemoSignIn("client")}
              disabled={isLoading}
            >
              <span className={styles.demoRole}>Client view</span>
              <span className={styles.demoDesc}>Complete check-ins &amp; view resources</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
