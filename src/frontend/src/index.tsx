import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { AppProvider } from "./app-context";
import { BRAND } from "./brand";
import { AuthOnboardingModal } from "./components/AuthOnboardingModal";
import { CreateSpaceModal } from "./components/CreateSpaceModal";
import { Layout } from "./components/Layout";
import { BookmarksPage } from "./pages/BookmarksPage";
import { ExplorePage } from "./pages/ExplorePage";
import { HomePage } from "./pages/HomePage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SettingsPage } from "./pages/SettingsPage";
import { SpacesPage } from "./pages/SpacesPage";
import { ThreadPage } from "./pages/ThreadPage";
import { useRoute } from "./router";

// Redirect direct path visits (e.g. /post/12 from OG links) to hash routes
if (!window.location.hash && window.location.pathname !== "/") {
    window.location.replace(`/#${window.location.pathname}`);
}

document.title = BRAND.name;

const AppRoutes: React.FC = () => {
    const route = useRoute();

    const renderPage = () => {
        switch (route.name) {
            case "home":
                return <HomePage />;
            case "space":
                return <HomePage spaceId={route.id} />;
            case "tag":
                return <HomePage tag={route.tag} />;
            case "spaces":
                return <SpacesPage />;
            case "post":
                return <ThreadPage postId={route.id} />;
            case "user":
                return <ProfilePage handle={route.handle} />;
            case "explore":
                return <ExplorePage initialQuery={route.query} />;
            case "notifications":
                return <NotificationsPage />;
            case "bookmarks":
                return <BookmarksPage />;
            case "settings":
                return <SettingsPage />;
        }
    };

    return (
        <Layout route={route}>
            {renderPage()}
            <AuthOnboardingModal />
            <CreateSpaceModal />
        </Layout>
    );
};

const rootEl = document.getElementById("root");
if (rootEl) {
    createRoot(rootEl).render(
        <React.StrictMode>
            <AppProvider>
                <AppRoutes />
            </AppProvider>
        </React.StrictMode>,
    );
}
