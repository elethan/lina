import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/login')({
    component: LoginPage,
})

function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('super@lina.com')
    const [password, setPassword] = useState('genesiscare')
    const [name, setName] = useState('Admin')
    const [isSignUp, setIsSignUp] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            if (isSignUp) {
                const { error } = await authClient.signUp.email({
                    email,
                    password,
                    name,
                })
                if (error) {
                    setError(error.message ?? 'Sign up failed')
                    setLoading(false)
                    return
                }
            } else {
                const { error } = await authClient.signIn.email({
                    email,
                    password,
                })
                if (error) {
                    setError(error.message ?? 'Sign in failed')
                    setLoading(false)
                    return
                }
            }
            router.navigate({ to: '/' })
        } catch (err) {
            setError('Something went wrong')
            setLoading(false)
        }
    }

    const handleMicrosoftSignIn = async () => {
        await authClient.signIn.social({
            provider: 'microsoft',
            callbackURL: '/',
        })
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            <div className="w-full max-w-md p-8">
                {/* Brand */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-black text-2xl mb-4">
                        L
                    </div>
                    <h1 className="text-2xl font-bold text-white">Welcome to Lina</h1>
                    <p className="text-slate-400 mt-1">Sign in to continue</p>
                </div>

                {/* Card */}
                <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 space-y-5">
                    {/* Microsoft SSO */}
                    <button
                        onClick={handleMicrosoftSignIn}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#2F2F2F] hover:bg-[#3b3b3b] text-white rounded-xl font-medium transition-colors border border-slate-600/30"
                    >
                        <svg viewBox="0 0 21 21" width="20" height="20">
                            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                        </svg>
                        Sign in with Microsoft
                    </button>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-slate-700/50" />
                        <span className="text-xs text-slate-500 uppercase tracking-wider">
                            or
                        </span>
                        <div className="flex-1 h-px bg-slate-700/50" />
                    </div>

                    {/* Email/Password Form */}
                    <form onSubmit={handleEmailAuth} className="space-y-4">
                        {isSignUp && (
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                    Name
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-colors"
                                    placeholder="Your name"
                                    required
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-colors"
                                placeholder="you@company.com"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-colors"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        {error && (
                            <p className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
                        >
                            {loading
                                ? 'Please wait...'
                                : isSignUp
                                    ? 'Create Account'
                                    : 'Sign In'}
                        </button>
                    </form>

                    {/* Toggle Sign Up / Sign In */}
                    <p className="text-center text-sm text-slate-400">
                        {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                        <button
                            onClick={() => {
                                setIsSignUp(!isSignUp)
                                setError('')
                            }}
                            className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
                        >
                            {isSignUp ? 'Sign in' : 'Sign up'}
                        </button>
                    </p>
                </div>

                {/* Footer hint */}
                <p className="text-center text-xs text-slate-600 mt-6">
                    Internal use only • Medical Equipment Management
                </p>
            </div>
        </div>
    )
}
