import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center p-6 bg-ios-background dark:bg-black">
                    <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-2xl text-center space-y-6">
                        <div className="w-16 h-16 bg-ios-red/10 rounded-full flex items-center justify-center mx-auto">
                            <span className="text-3xl">⚠️</span>
                        </div>
                        <h2 className="text-2xl font-bold dark:text-white">Something went wrong</h2>
                        <p className="text-ios-gray">
                            We've encountered an unexpected error. Usually a quick refresh helps.
                        </p>
                        <div className="p-4 bg-ios-background dark:bg-black rounded-xl text-xs font-mono text-left overflow-auto max-h-32 text-ios-red">
                            {this.state.error?.toString()}
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full bg-ios-blue text-white font-bold py-4 rounded-2xl active:scale-95 transition-transform"
                        >
                            Refresh App
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
