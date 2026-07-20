import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const api = axios.create({ baseURL: API_BASE_URL, withCredentials: true });

const getStoredToken = () => {
  const localToken = localStorage.getItem('accessToken');
  if (localToken) return localToken;
  return sessionStorage.getItem('accessToken') || '';
};
const setStoredToken = (token, rememberMe = false) => {
  if (rememberMe) {
    localStorage.setItem('accessToken', token);
    sessionStorage.removeItem('accessToken');
    localStorage.setItem('rememberMe', 'true');
  } else {
    sessionStorage.setItem('accessToken', token);
    localStorage.removeItem('accessToken');
    localStorage.setItem('rememberMe', 'false');
  }
};
const getStoredRefreshToken = () => {
  const localToken = localStorage.getItem('refreshToken');
  if (localToken) return localToken;
  return sessionStorage.getItem('refreshToken') || '';
};
const setStoredRefreshToken = (token, rememberMe = false) => {
  if (rememberMe) {
    localStorage.setItem('refreshToken', token);
    sessionStorage.removeItem('refreshToken');
  } else {
    sessionStorage.setItem('refreshToken', token);
    localStorage.removeItem('refreshToken');
  }
};
const clearStoredToken = () => {
  localStorage.removeItem('accessToken');
  sessionStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  sessionStorage.removeItem('refreshToken');
  localStorage.removeItem('rememberMe');
};
const getSocketUrl = () => {
  const configured = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  return configured.replace(/\/api$/, '').replace(/\/$/, '');
};

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let refreshQueue = [];
let authSessionExpired = false;

const refreshAccessToken = async () => {
  if (isRefreshing) {
    return new Promise((resolve) => {
      refreshQueue.push(resolve);
    });
  }

  isRefreshing = true;
  try {
    const refreshRes = await api.post('/auth/refresh', { refreshToken: getStoredRefreshToken() });
    const token = refreshRes.data.accessToken;
    const refreshToken = refreshRes.data.refreshToken || getStoredRefreshToken();
    setStoredToken(token, localStorage.getItem('rememberMe') === 'true');
    setStoredRefreshToken(refreshToken, localStorage.getItem('rememberMe') === 'true');
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    refreshQueue.forEach((resolve) => resolve(token));
    refreshQueue = [];
    return token;
  } catch (error) {
    authSessionExpired = true;
    clearStoredToken();
    delete api.defaults.headers.common.Authorization;
    refreshQueue.forEach((resolve) => resolve(null));
    refreshQueue = [];
    throw error;
  } finally {
    isRefreshing = false;
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const shouldRetry = error.response?.status === 401 && !authSessionExpired && !originalRequest._retry && !originalRequest.url?.includes('/auth/refresh') && !originalRequest.url?.includes('/auth/login');

    if (!shouldRetry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    try {
      const token = await refreshAccessToken();
      if (!token) {
        return Promise.reject(error);
      }

      originalRequest.headers.Authorization = `Bearer ${token}`;
      return api(originalRequest);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  }
);

const getAuthErrorMessage = (error) => {
  if (!error) return 'Something went wrong. Please try again.';

  if (axios.isAxiosError(error)) {
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED' || error.message === 'Network Error') {
      return 'The server is currently unavailable. Please make sure the backend is running on http://localhost:5000.';
    }

    if (error.response?.status === 401) {
      if (error.response?.data?.message === 'Invalid token' || error.response?.data?.message === 'Authentication required') {
        return 'Your session expired. Please sign in again.';
      }
      return 'Invalid email or password.';
    }

    if (error.response?.status === 409) {
      return 'An account with this email already exists.';
    }

    if (error.response?.data?.message) {
      return error.response.data.message;
    }
  }

  return 'Unable to complete the request. Please try again.';
};

const AuthPage = ({ onAuthenticated }) => {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [rememberMe, setRememberMe] = useState(localStorage.getItem('rememberMe') === 'true');
  const navigate = useNavigate();

  useEffect(() => {
    if (getStoredToken()) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  const loginMutation = useMutation({
    mutationFn: (payload) => api.post('/auth/login', payload),
    onSuccess: (res) => {
      authSessionExpired = false;
      const token = res.data.accessToken;
      const refreshToken = res.data.refreshToken;
      setStoredToken(token, rememberMe);
      if (refreshToken) {
        setStoredRefreshToken(refreshToken, rememberMe);
      }
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      onAuthenticated(res.data.user);
      toast.success('Signed in successfully');
      navigate('/dashboard', { replace: true });
    },
    onError: (error) => toast.error(getAuthErrorMessage(error)),
  });

  const registerMutation = useMutation({
    mutationFn: (payload) => api.post('/auth/register', payload),
    onSuccess: () => {
      toast.success('Account created. Please sign in.');
      setMode('login');
    },
    onError: (error) => toast.error(getAuthErrorMessage(error)),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === 'login') {
      loginMutation.mutate({ email: form.email, password: form.password, rememberMe });
    } else {
      registerMutation.mutate({ username: form.username, email: form.email, password: form.password });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center px-6 py-20">
        <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">TaskFlow Pro</p>
              <h1 className="mt-2 text-3xl font-semibold">Collaborate in real time</h1>
            </div>
            <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-sm text-cyan-300">Live workspace</div>
          </div>
          <div className="mb-6 flex gap-2">
            <button className={`rounded-full px-4 py-2 ${mode === 'login' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`} onClick={() => setMode('login')}>
              Sign in
            </button>
            <button className={`rounded-full px-4 py-2 ${mode === 'register' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`} onClick={() => setMode('register')}>
              Create account
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            )}
            <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            {mode === 'login' && (
              <label className="flex items-center gap-2 text-sm text-slate-400">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                Remember me and stay signed in
              </label>
            )}
            <button className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950" type="submit" disabled={loginMutation.isPending || registerMutation.isPending}>
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const DashboardPage = ({ user, onLogout }) => {
  const queryClient = useQueryClient();
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showWorkspaceSettingsModal, setShowWorkspaceSettingsModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showProjectMembersModal, setShowProjectMembersModal] = useState(false);
  const [showOrganizationModal, setShowOrganizationModal] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [organizationModalMode, setOrganizationModalMode] = useState('create');
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(null);
  const [selectedBillingPlanId, setSelectedBillingPlanId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [organizationForm, setOrganizationForm] = useState({ name: '', slug: '', description: '' });
  const [organizationMemberForm, setOrganizationMemberForm] = useState({ userId: '', role: 'MEMBER' });
  const [paymentMethodForm, setPaymentMethodForm] = useState({ provider: 'manual', brand: '', last4: '', expMonth: '', expYear: '', isDefault: true });
  const [groupForm, setGroupForm] = useState({ name: '', description: '', privacy: 'PUBLIC', image: '', organizationId: '' });
  const [projectForm, setProjectForm] = useState({ name: '', key: '' });
  const [projectMemberSearch, setProjectMemberSearch] = useState('');
  const [projectMemberForm, setProjectMemberForm] = useState({ userId: '', role: 'MEMBER' });
  const [chatDraft, setChatDraft] = useState('');
  const [chatImageUrl, setChatImageUrl] = useState('');
  const [chatFileUrl, setChatFileUrl] = useState('');
  const [chatFileName, setChatFileName] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatTyping, setChatTyping] = useState([]);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [replyMessageId, setReplyMessageId] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [chatRooms, setChatRooms] = useState([]);
  const [activeChatRoomId, setActiveChatRoomId] = useState('');
  const [roomMessages, setRoomMessages] = useState([]);
  const [roomDraft, setRoomDraft] = useState('');
  const [roomTypingUsers, setRoomTypingUsers] = useState([]);
  const socketRef = useRef(null);
  const previousProjectRoomRef = useRef(null);
  const previousChatRoomRef = useRef(null);
  const [workspaceSettingsForm, setWorkspaceSettingsForm] = useState({ name: '', description: '', privacy: 'PUBLIC', image: '', settings: { theme: 'default' } });
  const [taskForm, setTaskForm] = useState({ title: '', description: '', priority: 'MEDIUM', status: 'TODO', dueDate: '', groupId: '', projectId: '', issueTypeId: '', parentId: '', privacy: 'PUBLIC', type: '', assignedUserIds: [] });
  const navigate = useNavigate();

  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: () => api.get('/groups').then((res) => res.data.groups || []) });
  const { data: workspaceDetails } = useQuery({
    queryKey: ['workspace', selectedWorkspaceId],
    queryFn: () => api.get(`/groups/${selectedWorkspaceId}`).then((res) => res.data.group || null),
    enabled: Boolean(selectedWorkspaceId),
  });
  const { data: tasks = [] } = useQuery({ queryKey: ['tasks'], queryFn: () => api.get('/tasks').then((res) => res.data.tasks || []) });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects', selectedWorkspaceId],
    queryFn: () => api.get(`/projects?workspaceId=${selectedWorkspaceId}`).then((res) => res.data.projects || []),
    enabled: Boolean(selectedWorkspaceId),
  });
  const { data: issueTypes = [] } = useQuery({
    queryKey: ['projectIssueTypes', selectedProjectId],
    queryFn: () => api.get(`/projects/${selectedProjectId}/issue-types`).then((res) => res.data.issueTypes || []),
    enabled: Boolean(selectedProjectId),
  });
  const { data: friends = [] } = useQuery({ queryKey: ['friends'], queryFn: () => api.get('/friends').then((res) => res.data.friends || []) });
  const { data: requests = [] } = useQuery({ queryKey: ['friendRequests'], queryFn: () => api.get('/friends/requests').then((res) => res.data.requests || []) });
  const { data: notificationsResponse } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get('/notifications').then((res) => ({ notifications: res.data.notifications || [], unreadCount: res.data.unreadCount || 0 })), enabled: Boolean(user?.id) });
  const { data: workspaceChatRooms = [] } = useQuery({ queryKey: ['chatRooms'], queryFn: () => api.get('/chatrooms/rooms').then((res) => res.data.rooms || []), enabled: Boolean(user?.id) });
  const notifications = notificationsResponse?.notifications || [];
  const unreadNotificationCount = notificationsResponse?.unreadCount || notifications.filter((item) => !item.isRead).length;
  const { data: users = [] } = useQuery({
    queryKey: ['users', searchTerm],
    queryFn: () => api.get(`/users/search?q=${encodeURIComponent(searchTerm)}`).then((res) => res.data.users || []),
    enabled: Boolean(searchTerm),
  });
  const { data: discoverPeople = [] } = useQuery({
    queryKey: ['discoverPeople'],
    queryFn: () => api.get('/users/discover').then((res) => res.data.users || []),
    enabled: Boolean(user?.id),
  });
  const { data: organizations = [] } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations').then((res) => res.data.organizations || []),
    enabled: Boolean(user?.id),
  });
  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/organizations/plans').then((res) => res.data.plans || []),
    enabled: Boolean(user?.id),
  });
  const { data: selectedOrganizationDetails } = useQuery({
    queryKey: ['organization', selectedOrganizationId],
    queryFn: () => api.get(`/organizations/${selectedOrganizationId}`).then((res) => res.data.organization || null),
    enabled: Boolean(selectedOrganizationId),
  });
  const { data: organizationInvoices = [] } = useQuery({
    queryKey: ['organizationInvoices', selectedOrganizationId],
    queryFn: () => api.get(`/organizations/${selectedOrganizationId}/invoices`).then((res) => res.data.invoices || []),
    enabled: Boolean(selectedOrganizationId),
  });
  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['organizationPaymentMethods', selectedOrganizationId],
    queryFn: () => api.get(`/organizations/${selectedOrganizationId}/payment-methods`).then((res) => res.data.paymentMethods || []),
    enabled: Boolean(selectedOrganizationId),
  });
  const { data: projectMembers = [] } = useQuery({
    queryKey: ['projectMembers', selectedProjectId, projectMemberSearch],
    queryFn: () => api.get(`/projects/${selectedProjectId}/members?q=${encodeURIComponent(projectMemberSearch)}`).then((res) => res.data.memberships || []),
    enabled: Boolean(selectedProjectId),
  });
  const { data: chatHistory = [] } = useQuery({
    queryKey: ['projectChat', selectedProjectId],
    queryFn: () => api.get(`/chat/projects/${selectedProjectId}/messages`).then((res) => res.data.messages || []),
    enabled: Boolean(selectedProjectId),
  });
  const createOrganizationMutation = useMutation({
    mutationFn: (payload) => api.post('/organizations', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setOrganizationForm({ name: '', slug: '', description: '' });
      setSelectedOrganizationId(res.data.organization?.id || selectedOrganizationId);
      setShowOrganizationModal(false);
      toast.success('Organization created');
    },
    onError: () => toast.error('Could not create organization'),
  });
  const updateOrganizationMutation = useMutation({
    mutationFn: (payload) => api.put(`/organizations/${selectedOrganizationId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization', selectedOrganizationId] });
      setShowOrganizationModal(false);
      toast.success('Organization updated');
    },
    onError: () => toast.error('Could not update organization'),
  });
  const addOrganizationMemberMutation = useMutation({
    mutationFn: (payload) => api.post(`/organizations/${selectedOrganizationId}/members`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization', selectedOrganizationId] });
      toast.success('Member added to organization');
    },
    onError: () => toast.error('Could not add member'),
  });
  const createSubscriptionMutation = useMutation({
    mutationFn: (planId) => api.post(`/organizations/${selectedOrganizationId}/subscriptions`, { planId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', selectedOrganizationId] });
      queryClient.invalidateQueries({ queryKey: ['organizationInvoices', selectedOrganizationId] });
      queryClient.invalidateQueries({ queryKey: ['organizationPaymentMethods', selectedOrganizationId] });
      toast.success('Subscription created');
    },
    onError: () => toast.error('Could not create subscription'),
  });
  const addPaymentMethodMutation = useMutation({
    mutationFn: (payload) => api.post(`/organizations/${selectedOrganizationId}/payment-methods`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizationPaymentMethods', selectedOrganizationId] });
      queryClient.invalidateQueries({ queryKey: ['organization', selectedOrganizationId] });
      toast.success('Payment method added');
    },
    onError: () => toast.error('Could not add payment method'),
  });

  useEffect(() => {
    if (!selectedWorkspaceId && groups.length) {
      setSelectedWorkspaceId(groups[0].id);
    }
    if (selectedWorkspaceId && !groups.some((group) => group.id === selectedWorkspaceId)) {
      setSelectedWorkspaceId(groups[0]?.id || null);
    }
  }, [groups, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedProjectId && projects.length) {
      setSelectedProjectId(projects[0].id);
    }
    if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projects[0]?.id || null);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (!selectedOrganizationId && organizations.length) {
      setSelectedOrganizationId(organizations[0].id);
    }
    if (selectedOrganizationId && !organizations.some((organization) => organization.id === selectedOrganizationId)) {
      setSelectedOrganizationId(organizations[0]?.id || null);
    }
  }, [organizations, selectedOrganizationId]);

  useEffect(() => {
    if (selectedOrganizationId) {
      setGroupForm((prev) => ({ ...prev, organizationId: selectedOrganizationId }));
    }
  }, [selectedOrganizationId]);

  useEffect(() => {
    const hasSameMessages = chatMessages.length === chatHistory.length && chatMessages.every((message, index) => message.id === chatHistory[index]?.id);
    if (!hasSameMessages) {
      setChatMessages(chatHistory);
    }
  }, [chatHistory, chatMessages]);

  useEffect(() => {
    const socketUrl = getSocketUrl();
    const socket = io(socketUrl, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.emit('authenticate', { userId: user.id });
    socket.emit('join-room', `user:${user.id}`);
    socket.on('notification:new', (payload) => {
      toast.success(payload.title || 'New notification');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    socket.on('notification:update', () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    socket.on('notification:delete', () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    socket.on('notification:read', () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    socket.on('friend-request', () => {
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
    });
    socket.on('friend-accepted', () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
    });
    socket.on('task-created', () => queryClient.invalidateQueries({ queryKey: ['tasks'] }));
    socket.on('task-updated', () => queryClient.invalidateQueries({ queryKey: ['tasks'] }));
    socket.on('task-assigned', () => queryClient.invalidateQueries({ queryKey: ['tasks'] }));
    socket.on('message:send', (message) => {
      if (!message || message.type === 'message:new') return;
      setChatMessages((current) => [...current, message]);
      queryClient.invalidateQueries({ queryKey: ['projectChat', selectedProjectId] });
    });
    socket.on('message:update', (message) => {
      setChatMessages((current) => current.map((item) => item.id === message.id ? message : item));
    });
    socket.on('message:delete', ({ id }) => {
      setChatMessages((current) => current.filter((item) => item.id !== id));
    });
    socket.on('message:read', ({ messageId, userId }) => {
      if (userId === user.id) return;
      setChatMessages((current) => current.map((item) => item.id === messageId ? { ...item, reads: [...(item.reads || []), { userId }] } : item));
    });
    socket.on('project:typing', (payload) => {
      if (payload.userId === user.id) return;
      setChatTyping((current) => current.includes(payload.userId) ? current : [...current, payload.userId]);
    });
    socket.on('chat:message', (message) => {
      setRoomMessages((current) => [...current, message]);
    });
    socket.on('chat:update', (message) => {
      setRoomMessages((current) => current.map((item) => item.id === message.id ? message : item));
    });
    socket.on('chat:delete', ({ id }) => {
      setRoomMessages((current) => current.filter((item) => item.id !== id));
    });
    socket.on('chat:typing:start', (payload) => {
      setRoomTypingUsers((current) => current.includes(payload.userId) ? current : [...current, payload.userId]);
    });
    socket.on('chat:typing:stop', (payload) => {
      setRoomTypingUsers((current) => current.filter((userId) => userId !== payload.userId));
    });
    socket.on('user:online', () => queryClient.invalidateQueries({ queryKey: ['projectMembers', selectedProjectId] }));
    socket.on('user:offline', () => queryClient.invalidateQueries({ queryKey: ['projectMembers', selectedProjectId] }));
    return () => socket.disconnect();
  }, [queryClient, selectedProjectId, user.id]);

  useEffect(() => {
    if (!socketRef.current || !selectedProjectId || !user?.id) return;
    const roomId = `project:${selectedProjectId}`;
    if (previousProjectRoomRef.current && previousProjectRoomRef.current !== roomId) {
      socketRef.current.emit('leave-room', previousProjectRoomRef.current);
    }
    socketRef.current.emit('join-room', roomId);
    previousProjectRoomRef.current = roomId;
  }, [selectedProjectId, user?.id]);

  useEffect(() => {
    if (!socketRef.current || !activeChatRoomId) return;
    if (previousChatRoomRef.current && previousChatRoomRef.current !== activeChatRoomId) {
      socketRef.current.emit('leave-room', previousChatRoomRef.current);
    }
    socketRef.current.emit('join-room', activeChatRoomId);
    previousChatRoomRef.current = activeChatRoomId;
  }, [activeChatRoomId, user?.id]);

  const resetGroupForm = () => {
    setGroupForm({ name: '', description: '', privacy: 'PUBLIC', image: '', organizationId: selectedOrganizationId || '' });
  };

  const createGroupMutation = useMutation({
    mutationFn: (payload) => api.post('/groups', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setShowGroupModal(false);
      resetGroupForm();
      setSelectedWorkspaceId(res.data.group?.id || null);
      toast.success('Workspace created');
    },
    onError: () => toast.error('Could not create workspace'),
  });

  const resetTaskForm = () => {
    setTaskForm({ title: '', description: '', priority: 'MEDIUM', status: 'TODO', dueDate: '', groupId: '', projectId: selectedProjectId || '', issueTypeId: '', parentId: '', privacy: 'PUBLIC', type: '', assignedUserIds: [] });
    setEditingTaskId(null);
  };

  const createTaskMutation = useMutation({
    mutationFn: (payload) => api.post('/tasks', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowTaskModal(false);
      resetTaskForm();
      toast.success('Task created');
    },
    onError: (error) => toast.error(error?.response?.data?.message || 'Could not create task'),
  });

  const createProjectMutation = useMutation({
    mutationFn: (payload) => api.post('/projects', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['projects', selectedWorkspaceId] });
      setShowProjectModal(false);
      setProjectForm({ name: '', key: '' });
      setSelectedProjectId(res.data.project?.id || '');
      toast.success('Project created');
    },
    onError: (error) => toast.error(error?.response?.data?.message || 'Could not create project'),
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, payload }) => api.put(`/tasks/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowTaskModal(false);
      resetTaskForm();
      toast.success('Task updated');
    },
    onError: () => toast.error('Could not update task'),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id) => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task deleted');
    },
    onError: () => toast.error('Could not delete task'),
  });

  const sendRequestMutation = useMutation({
    mutationFn: (receiverId) => api.post('/friends/requests', { receiverId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      queryClient.invalidateQueries({ queryKey: ['discoverPeople'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      toast.success('Friend request sent');
    },
    onError: (error) => toast.error(error?.response?.data?.message || 'Unable to send request'),
  });

  const respondRequestMutation = useMutation({
    mutationFn: ({ id, action }) => api.post(`/friends/requests/${id}/respond`, { action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['discoverPeople'] });
      toast.success('Request updated');
    },
    onError: () => toast.error('Unable to update request'),
  });

  const markReadMutation = useMutation({
    mutationFn: () => api.post('/notifications/read'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Notifications marked read');
    },
  });

  const markSingleNotificationReadMutation = useMutation({
    mutationFn: (id) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: (id) => api.delete(`/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: (payload) => api.put(`/groups/${selectedWorkspaceId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', selectedWorkspaceId] });
      setShowWorkspaceSettingsModal(false);
      toast.success('Workspace updated');
    },
    onError: () => toast.error('Could not update workspace'),
  });

  const archiveWorkspaceMutation = useMutation({
    mutationFn: () => api.post(`/groups/${selectedWorkspaceId}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', selectedWorkspaceId] });
      toast.success('Workspace archived');
    },
    onError: () => toast.error('Could not archive workspace'),
  });

  const restoreWorkspaceMutation = useMutation({
    mutationFn: () => api.post(`/groups/${selectedWorkspaceId}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', selectedWorkspaceId] });
      toast.success('Workspace restored');
    },
    onError: () => toast.error('Could not restore workspace'),
  });

  const inviteWorkspaceMutation = useMutation({
    mutationFn: (payload) => api.post(`/groups/${selectedWorkspaceId}/invite`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', selectedWorkspaceId] });
      setInviteEmail('');
      setShowInviteModal(false);
      toast.success('Invitation sent');
    },
    onError: (error) => toast.error(error?.response?.data?.message || 'Could not invite member'),
  });

  const addMemberMutation = useMutation({
    mutationFn: (userId) => api.post(`/groups/${selectedWorkspaceId}/members`, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', selectedWorkspaceId] });
      toast.success('Member added');
    },
    onError: (error) => toast.error(error?.response?.data?.message || 'Could not add member'),
  });

  const addProjectMemberMutation = useMutation({
    mutationFn: ({ projectId, payload }) => api.post(`/projects/${projectId}/members`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', selectedProjectId] });
      setProjectMemberForm({ userId: '', role: 'MEMBER' });
      toast.success('Project member added');
    },
    onError: (error) => toast.error(error?.response?.data?.message || 'Could not add project member'),
  });

  const updateProjectMemberMutation = useMutation({
    mutationFn: ({ projectId, memberId, role }) => api.put(`/projects/${projectId}/members/${memberId}`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', selectedProjectId] });
      toast.success('Project role updated');
    },
    onError: (error) => toast.error(error?.response?.data?.message || 'Could not update role'),
  });

  const removeProjectMemberMutation = useMutation({
    mutationFn: ({ projectId, memberId }) => api.delete(`/projects/${projectId}/members/${memberId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', selectedProjectId] });
      toast.success('Project member removed');
    },
    onError: (error) => toast.error(error?.response?.data?.message || 'Could not remove member'),
  });

  const sendMessageMutation = useMutation({
    mutationFn: (payload) => api.post(`/chat/projects/${selectedProjectId}/messages`, payload),
    onSuccess: (res) => {
      setChatDraft('');
      setChatImageUrl('');
      setChatFileUrl('');
      setChatFileName('');
      setEditingMessageId(null);
      setReplyMessageId(null);
      setChatMessages((current) => [...current, res.data.message]);
      socketRef.current?.emit('project:message', { roomId: `project:${selectedProjectId}`, message: res.data.message });
      queryClient.invalidateQueries({ queryKey: ['projectChat', selectedProjectId] });
    },
    onError: (error) => toast.error(error?.response?.data?.message || 'Could not send message'),
  });

  const editMessageMutation = useMutation({
    mutationFn: ({ messageId, content }) => api.put(`/chat/projects/${selectedProjectId}/messages/${messageId}`, { content }),
    onSuccess: (res) => {
      setEditingMessageId(null);
      setChatMessages((current) => current.map((item) => item.id === res.data.message.id ? res.data.message : item));
      toast.success('Message updated');
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId) => api.delete(`/chat/projects/${selectedProjectId}/messages/${messageId}`),
    onSuccess: (_res, messageId) => {
      setChatMessages((current) => current.filter((item) => item.id !== messageId));
      toast.success('Message deleted');
    },
  });

  const markChatReadMutation = useMutation({
    mutationFn: (messageId) => api.post(`/chat/projects/${selectedProjectId}/messages/${messageId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectChat', selectedProjectId] });
    },
  });

  const reactToMessageMutation = useMutation({
    mutationFn: ({ messageId, emoji }) => api.post(`/chat/projects/${selectedProjectId}/messages/${messageId}/reactions`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectChat', selectedProjectId] });
    },
  });

  const joinRoomMutation = useMutation({
    mutationFn: (roomId) => api.post(`/chatrooms/rooms/${roomId}/join`),
    onSuccess: (_res, roomId) => {
      setActiveChatRoomId(roomId);
      api.get(`/chatrooms/rooms/${roomId}/messages`).then((res) => setRoomMessages(res.data.messages || [])).catch(() => setRoomMessages([]));
    },
  });

  const createPrivateChatRoomMutation = useMutation({
    mutationFn: (targetUserId) => api.post('/chatrooms/rooms/private', { targetUserId }),
    onSuccess: (res) => {
      const roomId = res.data.room.id;
      setActiveChatRoomId(roomId);
      queryClient.invalidateQueries({ queryKey: ['chatRooms'] });
      joinRoomMutation.mutate(roomId);
    },
  });

  const sendRoomMessageMutation = useMutation({
    mutationFn: ({ roomId, content }) => api.post(`/chatrooms/rooms/${roomId}/messages`, { content }),
    onSuccess: (res, { roomId }) => {
      setRoomDraft('');
      if (res?.data?.message) {
        setRoomMessages((current) => [...current, res.data.message]);
      }
      socketRef.current?.emit('join-room', roomId);
    },
  });

  const typingRoomMutation = useMutation({
    mutationFn: (roomId) => api.post(`/chatrooms/rooms/${roomId}/typing`),
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: () => api.delete(`/groups/${selectedWorkspaceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setSelectedWorkspaceId(null);
      toast.success('Workspace deleted');
    },
    onError: () => toast.error('Could not delete workspace'),
  });

  const handleLogout = () => {
    api.post('/auth/logout', { refreshToken: getStoredRefreshToken() }).catch((error) => {
      console.warn('Logout API failed:', error?.message || error);
    });

    clearStoredToken();
    delete api.defaults.headers.common.Authorization;
    onLogout();
    navigate('/', { replace: true });
  };

  const selectedWorkspace = useMemo(() => {
    return groups.find((group) => group.id === selectedWorkspaceId) || workspaceDetails || null;
  }, [groups, selectedWorkspaceId, workspaceDetails]);

  const visibleTasks = useMemo(() => {
    if (selectedProjectId) {
      return tasks.filter((task) => task.project?.id === selectedProjectId);
    }
    return tasks.filter((task) => task.groupId === selectedWorkspace?.id);
  }, [tasks, selectedProjectId, selectedWorkspace]);

  const workspaceStats = useMemo(() => {
    const workspaceTasks = tasks.filter((task) => task.groupId === selectedWorkspace?.id);
    return {
      totalTasks: workspaceTasks.length,
      completedTasks: workspaceTasks.filter((task) => task.status === 'COMPLETED').length,
      members: selectedWorkspace?.memberships?.length || 0,
      archived: Boolean(selectedWorkspace?.isArchived),
    };
  }, [selectedWorkspace, tasks]);

  const taskCounts = useMemo(
    () => ({ total: visibleTasks.length, todo: visibleTasks.filter((task) => task.status === 'TODO').length, done: visibleTasks.filter((task) => task.status === 'COMPLETED').length }),
    [visibleTasks]
  );

  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) || null, [projects, selectedProjectId]);

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">TaskFlow Pro</p>
              <h1 className="text-2xl font-semibold">Welcome back, {user.username}</h1>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <button className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2" onClick={() => setShowNotifications((value) => !value)}>Notifications {unreadNotificationCount > 0 ? `(${unreadNotificationCount})` : ''}</button>
                {showNotifications && (
                  <div className="absolute right-0 z-20 mt-2 w-80 rounded-2xl border border-slate-800 bg-slate-900 p-3 shadow-xl">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="font-semibold">Notifications</h3>
                      <button className="text-xs text-cyan-300" onClick={() => markReadMutation.mutate()}>Mark all read</button>
                    </div>
                    <div className="max-h-80 space-y-2 overflow-auto">
                      {notifications.length === 0 && <p className="text-sm text-slate-400">No notifications yet.</p>}
                      {notifications.map((item) => (
                        <div key={item.id} className={`rounded-xl border p-2 text-sm ${item.isRead ? 'border-slate-800 bg-slate-950' : 'border-cyan-700 bg-cyan-950/30'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">{item.title}</p>
                              <p className="text-slate-400">{item.message}</p>
                            </div>
                            <div className="flex gap-1">
                              {!item.isRead && <button className="text-xs text-cyan-300" onClick={() => markSingleNotificationReadMutation.mutate(item.id)}>Read</button>}
                              <button className="text-xs text-rose-300" onClick={() => deleteNotificationMutation.mutate(item.id)}>Delete</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2" onClick={() => setShowGroupModal(true)}>New workspace</button>
              <button className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2" onClick={() => setShowProjectModal(true)}>New project</button>
              <button className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2" onClick={() => { resetTaskForm(); setShowTaskModal(true); }}>New task</button>
              <button type="button" className="rounded-xl bg-cyan-500 px-3 py-2 font-semibold text-slate-950" onClick={handleLogout}>Logout</button>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[260px_1fr_320px]">
          <aside className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-sm text-slate-400">Overview</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><span>Tasks</span><strong>{taskCounts.total}</strong></div>
                <div className="flex justify-between"><span>Completed</span><strong>{taskCounts.done}</strong></div>
                <div className="flex justify-between"><span>Friends</span><strong>{friends.length}</strong></div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-slate-400">Organizations</p>
                <button className="text-xs text-cyan-300" onClick={() => { setOrganizationModalMode('create'); setOrganizationForm({ name: '', slug: '', description: '' }); setShowOrganizationModal(true); }}>New org</button>
              </div>
              <div className="mt-3 space-y-2">
                {organizations.map((organization) => (
                  <button key={organization.id} className={`w-full rounded-xl px-3 py-2 text-left text-sm ${selectedOrganizationId === organization.id ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-300'}`} onClick={() => setSelectedOrganizationId(organization.id)}>
                    <div className="font-medium">{organization.name}</div>
                    <div className="text-xs text-slate-400">{organization.description || organization.slug || 'Organization'}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <p className="text-sm text-slate-400">Workspaces</p>
              <div className="mt-3 space-y-2">
                {groups.map((group) => (
                  <button key={group.id} className={`w-full rounded-xl px-3 py-2 text-left text-sm ${selectedWorkspace?.id === group.id ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-300'}`} onClick={() => setSelectedWorkspaceId(group.id)}>
                    <div className="font-medium">{group.name}</div>
                    <div className="text-xs text-slate-400">{group.description || 'Workspace'}</div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            {selectedOrganizationDetails && (
              <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Organization Hub</h2>
                    <p className="text-sm text-slate-400">Manage org members, billing, and tenant resources.</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm" onClick={() => setShowBillingModal(true)}>Billing</button>
                    <button className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm" onClick={() => { setOrganizationModalMode('edit'); setOrganizationForm({ name: selectedOrganizationDetails?.name || '', slug: selectedOrganizationDetails?.slug || '', description: selectedOrganizationDetails?.description || '' }); setShowOrganizationModal(true); }}>Edit org</button>
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <p className="text-sm text-slate-400">Organization</p>
                    <p className="mt-2 text-lg font-semibold">{selectedOrganizationDetails.name}</p>
                    <p className="text-sm text-slate-400">{selectedOrganizationDetails.description || 'No description yet.'}</p>
                    <p className="mt-2 text-xs text-slate-500">Slug: {selectedOrganizationDetails.slug}</p>
                    <p className="mt-2 text-xs text-slate-500">Owner: {selectedOrganizationDetails.owner?.username || selectedOrganizationDetails.owner?.email}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <p className="text-sm text-slate-400">Active subscription</p>
                    {selectedOrganizationDetails.subscriptions?.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {selectedOrganizationDetails.subscriptions.map((subscription) => (
                          <div key={subscription.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
                            <div className="text-sm font-medium">{subscription.plan?.name}</div>
                            <div className="text-xs text-slate-400">{subscription.plan?.description}</div>
                            <div className="mt-2 text-xs text-slate-500">Status: {subscription.status}</div>
                            <div className="text-xs text-slate-500">Renews: {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'TBD'}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-400">No subscription yet. Open billing to choose a plan.</div>
                    )}
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <p className="text-sm text-slate-400">Payment methods</p>
                    <div className="mt-3 space-y-2">
                      {paymentMethods.length === 0 ? (
                        <p className="text-sm text-slate-400">No payment methods linked.</p>
                      ) : paymentMethods.map((method) => (
                        <div key={method.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
                          <p className="text-sm font-medium">{method.brand || 'Manual card'}</p>
                          <p className="text-xs text-slate-400">•••• {method.last4}</p>
                          <p className="text-xs text-slate-500">Expires {method.expMonth}/{method.expYear}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}
            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Workspace Hub</h2>
                <div className="flex gap-2">
                  <button className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm" onClick={() => { setWorkspaceSettingsForm({ name: selectedWorkspace?.name || '', description: selectedWorkspace?.description || '', privacy: selectedWorkspace?.privacy || 'PUBLIC', image: selectedWorkspace?.image || '', settings: typeof selectedWorkspace?.settings === 'string' ? JSON.parse(selectedWorkspace.settings) : { theme: 'default' } }); setShowWorkspaceSettingsModal(true); }}>Settings</button>
                  <button className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm" onClick={() => setShowInviteModal(true)}>Invite</button>
                  <button className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm" onClick={() => setShowProjectMembersModal(true)}>Project members</button>
                </div>
              </div>
              {selectedWorkspace ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/20 text-lg font-semibold text-cyan-300">{selectedWorkspace.image ? '●' : selectedWorkspace.name?.slice(0, 1).toUpperCase()}</div>
                      <div>
                        <h3 className="text-lg font-semibold">{selectedWorkspace.name}</h3>
                        <p className="text-sm text-slate-400">{selectedWorkspace.description || 'A collaborative workspace for your team.'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                      <span className={`rounded-full px-2 py-1 ${selectedWorkspace.isArchived ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{selectedWorkspace.isArchived ? 'Archived' : 'Active'}</span>
                      <span className="rounded-full bg-slate-800 px-2 py-1">{selectedWorkspace.privacy || 'PUBLIC'}</span>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                      <p className="text-sm text-slate-400">Tasks</p>
                      <p className="mt-1 text-2xl font-semibold">{workspaceStats.totalTasks}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                      <p className="text-sm text-slate-400">Completed</p>
                      <p className="mt-1 text-2xl font-semibold">{workspaceStats.completedTasks}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                      <p className="text-sm text-slate-400">Members</p>
                      <p className="mt-1 text-2xl font-semibold">{workspaceStats.members}</p>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="font-semibold">Members</h4>
                        <button className="rounded-xl border border-slate-700 bg-slate-800 px-2 py-1 text-xs" onClick={() => setShowInviteModal(true)}>Invite</button>
                      </div>
                      <div className="space-y-2">
                        {(workspaceDetails?.memberships || selectedWorkspace.memberships || []).map((member) => (
                          <div key={member.id} className="flex items-center justify-between rounded-xl bg-slate-800 px-3 py-2 text-sm">
                            <div>
                              <p className="font-medium">{member.user?.username || member.userId}</p>
                              <p className="text-xs text-slate-400">{member.role}</p>
                            </div>
                            {member.role !== 'SUPER_ADMIN' && <button className="rounded-lg border border-slate-700 px-2 py-1 text-xs" onClick={() => addMemberMutation.mutate(member.userId)}>Add</button>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="font-semibold">Activity</h4>
                        <div className="flex gap-2">
                          {selectedWorkspace.isArchived ? (
                            <button className="rounded-xl border border-emerald-700 px-2 py-1 text-xs text-emerald-300" onClick={() => restoreWorkspaceMutation.mutate()}>Restore</button>
                          ) : (
                            <button className="rounded-xl border border-amber-700 px-2 py-1 text-xs text-amber-300" onClick={() => archiveWorkspaceMutation.mutate()}>Archive</button>
                          )}
                          <button className="rounded-xl border border-rose-700 px-2 py-1 text-xs text-rose-300" onClick={() => deleteWorkspaceMutation.mutate()}>Delete</button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {(workspaceDetails?.activityLogs || []).map((entry) => (
                          <div key={entry.id} className="rounded-xl bg-slate-800 px-3 py-2 text-sm">
                            <div className="font-medium">{entry.action}</div>
                            <div className="text-xs text-slate-400">{entry.details} • {entry.user?.username || 'System'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">Create or select a workspace to see its members, activity, and stats.</div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Tasks</h2>
                <button className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm" onClick={() => { resetTaskForm(); setShowTaskModal(true); }}>Create task</button>
              </div>
              <div className="grid gap-3">
                {visibleTasks.map((task) => (
                  <div key={task.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{task.title}</h3>
                        <p className="text-sm text-slate-400">{task.description || 'No description'}</p>
                      </div>
                      <div className="flex gap-2">
                        <button className="rounded-lg border border-slate-700 px-2 py-1 text-xs" onClick={() => {
                          setTaskForm({
                            title: task.title,
                            description: task.description || '',
                            priority: task.priority,
                            status: task.status,
                            dueDate: task.dueDate ? task.dueDate.slice(0,10) : '',
                            groupId: task.groupId || '',
                            projectId: task.project?.id || '',
                            issueTypeId: task.issueType?.id || '',
                            parentId: task.parentId || '',
                            privacy: task.privacy || 'PUBLIC',
                            type: task.type || '',
                            assignedUserIds: task.assignments?.map((item) => item.userId) || [],
                          });
                          setEditingTaskId(task.id);
                          setShowTaskModal(true);
                        }}>Edit</button>
                        <button className="rounded-lg border border-rose-700 px-2 py-1 text-xs text-rose-300" onClick={() => deleteTaskMutation.mutate(task.id)}>Delete</button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                      <span className="rounded-full bg-slate-800 px-2 py-1">Priority: {task.priority}</span>
                      <span className="rounded-full bg-slate-800 px-2 py-1">Project: {task.project?.name || 'None'}</span>
                      <span className="rounded-full bg-slate-800 px-2 py-1">Issue: {task.issueType?.name || task.type || 'General'}</span>
                      {task.parent && <span className="rounded-full bg-slate-800 px-2 py-1">Parent: {task.parent.title}</span>}
                      <span className="rounded-full bg-slate-800 px-2 py-1">Created by: {task.createdBy?.username || 'Unknown'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Workspace chat</h2>
                <div className="flex gap-2">
                  {chatRooms.map((room) => (
                    <button key={room.id} className={`rounded-xl border px-2 py-1 text-xs ${activeChatRoomId === room.id ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300' : 'border-slate-700 bg-slate-800'}`} onClick={() => joinRoomMutation.mutate(room.id)}>
                      {room.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {friends.map((friend) => (
                  <button key={friend.id} className="rounded-xl border border-slate-700 bg-slate-800 px-2 py-1 text-xs" onClick={() => createPrivateChatRoomMutation.mutate(friend.id)}>
                    Private chat with {friend.username}
                  </button>
                ))}
              </div>
              {activeChatRoomId ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                  <div className="mb-3 space-y-2">
                    {roomMessages.map((message) => (
                      <div key={message.id} className="rounded-xl bg-slate-800 p-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{message.sender?.username || 'Unknown'}</span>
                          <span className="text-xs text-slate-400">{new Date(message.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="mt-1 text-slate-300">{message.content || 'Shared attachment'}</p>
                      </div>
                    ))}
                  </div>
                  {roomTypingUsers.length > 0 && <p className="text-xs text-cyan-300">Typing…</p>}
                  <div className="mt-3 flex gap-2">
                    <input className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Message" value={roomDraft} onChange={(e) => { setRoomDraft(e.target.value); typingRoomMutation.mutate(activeChatRoomId); }} />
                    <button className="rounded-xl bg-cyan-500 px-3 py-2 font-semibold text-slate-950" onClick={() => sendRoomMessageMutation.mutate({ roomId: activeChatRoomId, content: roomDraft })}>Send</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Select a room to start chatting.</p>
              )}
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Discover People</h2>
              </div>
              <div className="grid gap-3">
                {discoverPeople.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-center text-slate-400">
                    No other Task Manager accounts were found. If you have more users registered, they will appear here.
                  </div>
                ) : (
                  discoverPeople.map((person) => (
                    <div key={person.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-500/20 text-sm font-semibold text-cyan-300">
                            {person.avatar ? <img src={person.avatar} alt={person.username} className="h-11 w-11 rounded-full object-cover" /> : (person.username || 'U').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium">{person.fullName || person.username}</p>
                            <p className="text-sm text-slate-400">@{person.username}</p>
                            <p className="text-sm text-slate-400">{person.email}</p>
                            {person.mutualWorkspaces?.length > 0 && <p className="text-xs text-cyan-300">Mutual workspaces: {person.mutualWorkspaces.map((workspace) => workspace.name).join(', ')}</p>}
                            {person.mutualProjects?.length > 0 && <p className="text-xs text-cyan-300">Mutual projects: {person.mutualProjects.map((project) => project.name).join(', ')}</p>}
                            <p className="text-xs text-slate-500">Status: {person.status}</p>
                          </div>
                        </div>
                        <button className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950" onClick={() => sendRequestMutation.mutate(person.id)} disabled={sendRequestMutation.isPending}>
                          {sendRequestMutation.isPending ? 'Sending…' : 'Send Request'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Project chat</h2>
                <span className="text-sm text-slate-400">{selectedProject?.name || 'Project'}</span>
              </div>
              <div className="mb-3 rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <div className="mb-3 space-y-2">
                  {chatMessages.map((message) => (
                    <div key={message.id} className="rounded-xl bg-slate-800 p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{message.sender?.username || 'Unknown'}</span>
                        <span className="text-xs text-slate-400">{new Date(message.createdAt).toLocaleString()}</span>
                      </div>
                      {message.replyTo && <p className="text-xs text-cyan-300">Reply to: {message.replyTo.content}</p>}
                      <p className="mt-1 text-slate-300">{message.content || (message.fileName ? `Shared file: ${message.fileName}` : 'Shared attachment')}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button className="rounded-lg border border-slate-700 px-2 py-1 text-xs" onClick={() => { setReplyMessageId(message.id); setEditingMessageId(null); }}>Reply</button>
                        <button className="rounded-lg border border-slate-700 px-2 py-1 text-xs" onClick={() => { setEditingMessageId(message.id); setChatDraft(message.content || ''); }}>Edit</button>
                        <button className="rounded-lg border border-rose-700 px-2 py-1 text-xs text-rose-300" onClick={() => deleteMessageMutation.mutate(message.id)}>Delete</button>
                        <button className="rounded-lg border border-slate-700 px-2 py-1 text-xs" onClick={() => reactToMessageMutation.mutate({ messageId: message.id, emoji: '👍' })}>👍</button>
                        <button className="rounded-lg border border-slate-700 px-2 py-1 text-xs" onClick={() => markChatReadMutation.mutate(message.id)}>Read</button>
                      </div>
                    </div>
                  ))}
                </div>
                {chatTyping.length > 0 && <p className="text-xs text-cyan-300">{chatTyping.length} person typing…</p>}
                <div className="mt-3 space-y-2">
                  {editingMessageId && <p className="text-xs text-cyan-300">Editing message…</p>}
                  {replyMessageId && <p className="text-xs text-cyan-300">Replying to a message…</p>}
                  <div className="flex gap-2">
                    <input className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Type a message" value={chatDraft} onChange={(e) => { setChatDraft(e.target.value); socketRef.current?.emit('project:typing', { roomId: `project:${selectedProjectId}`, payload: { userId: user.id } }); }} />
                    <button className="rounded-xl bg-cyan-500 px-3 py-2 font-semibold text-slate-950" onClick={() => {
                      if (!selectedProjectId) {
                        toast.error('Select a project first');
                        return;
                      }
                      if (editingMessageId) {
                        editMessageMutation.mutate({ messageId: editingMessageId, content: chatDraft });
                      } else {
                        sendMessageMutation.mutate({ content: chatDraft, replyToId: replyMessageId || undefined, imageUrl: chatImageUrl || undefined, fileUrl: chatFileUrl || undefined, fileName: chatFileName || undefined });
                      }
                    }}>
                      {editingMessageId ? 'Update' : 'Send'}
                    </button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <input className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Image URL (optional)" value={chatImageUrl} onChange={(e) => setChatImageUrl(e.target.value)} />
                    <input className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="File URL (optional)" value={chatFileUrl} onChange={(e) => setChatFileUrl(e.target.value)} />
                  </div>
                  <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="File label (optional)" value={chatFileName} onChange={(e) => setChatFileName(e.target.value)} />
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Friends</h2>
              </div>
              <input className="mb-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Search users by username" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              <div className="grid gap-3">
                {users.map((person) => (
                  <div key={person.id} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 p-3">
                    <div>
                      <p className="font-medium">{person.username}</p>
                      <p className="text-sm text-slate-400">{person.email}</p>
                    </div>
                    <button className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950" onClick={() => sendRequestMutation.mutate(person.id)}>
                      Send request
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-2">
                {friends.map((friend) => <div key={friend.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm">{friend.username}</div>)}
              </div>
            </section>
          </main>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Incoming requests</h2>
              </div>
              <div className="space-y-2">
                {requests.map((request) => (
                  <div key={request.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span>{request.sender?.username}</span>
                      <div className="flex gap-2">
                        <button className="rounded-lg bg-emerald-500/20 px-2 py-1 text-emerald-300" onClick={() => respondRequestMutation.mutate({ id: request.id, action: 'accept' })}>Accept</button>
                        <button className="rounded-lg bg-rose-500/20 px-2 py-1 text-rose-300" onClick={() => respondRequestMutation.mutate({ id: request.id, action: 'reject' })}>Reject</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Notifications</h2>
                <button className="rounded-xl border border-slate-700 bg-slate-800 px-2 py-1 text-sm" onClick={() => markReadMutation.mutate()}>Mark all read</button>
              </div>
              <div className="space-y-2">
                {notifications.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-slate-400">{item.message}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {showGroupModal && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-xl font-semibold">Create workspace</h3>
            <div className="mt-4 space-y-3">
              <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Workspace name" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} />
              <textarea className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Description" value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} />
              <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Logo URL (optional)" value={groupForm.image} onChange={(e) => setGroupForm({ ...groupForm, image: e.target.value })} />
              <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" value={groupForm.privacy} onChange={(e) => setGroupForm({ ...groupForm, privacy: e.target.value })}>
                <option value="PUBLIC">Public</option>
                <option value="PRIVATE">Private</option>
              </select>
              <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" value={groupForm.organizationId || ''} onChange={(e) => setGroupForm({ ...groupForm, organizationId: e.target.value || '' })}>
                <option value="">No organization</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-700 px-3 py-2" onClick={() => { setShowGroupModal(false); resetGroupForm(); }}>Cancel</button>
              <button className="rounded-xl bg-cyan-500 px-3 py-2 font-semibold text-slate-950" onClick={() => createGroupMutation.mutate(groupForm)}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showOrganizationModal && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-xl font-semibold">{organizationModalMode === 'edit' ? 'Edit organization' : 'Create organization'}</h3>
            <div className="mt-4 space-y-3">
              <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Organization name" value={organizationForm.name} onChange={(e) => setOrganizationForm({ ...organizationForm, name: e.target.value })} />
              <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Organization slug" value={organizationForm.slug} onChange={(e) => setOrganizationForm({ ...organizationForm, slug: e.target.value })} />
              <textarea className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Description" value={organizationForm.description} onChange={(e) => setOrganizationForm({ ...organizationForm, description: e.target.value })} />
              {organizationModalMode === 'edit' && selectedOrganizationDetails && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm">
                  <p className="font-medium">Members</p>
                  {selectedOrganizationDetails.memberships?.map((member) => (
                    <div key={member.id} className="mt-2 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-2">
                      <div>
                        <p>{member.user?.username || member.user?.email}</p>
                        <p className="text-xs text-slate-400">{member.role}</p>
                      </div>
                    </div>
                  ))}
                  <div className="mt-3 space-y-2">
                    <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Invite user ID" value={organizationMemberForm.userId} onChange={(e) => setOrganizationMemberForm({ ...organizationMemberForm, userId: e.target.value })} />
                    <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" value={organizationMemberForm.role} onChange={(e) => setOrganizationMemberForm({ ...organizationMemberForm, role: e.target.value })}>
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                      <option value="OWNER">Owner</option>
                    </select>
                    <button className="w-full rounded-xl bg-cyan-500 px-3 py-2 font-semibold text-slate-950" onClick={() => addOrganizationMemberMutation.mutate(organizationMemberForm)}>Add member</button>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-700 px-3 py-2" onClick={() => { setShowOrganizationModal(false); setOrganizationForm({ name: '', slug: '', description: '' }); setOrganizationMemberForm({ userId: '', role: 'MEMBER' }); }}>Cancel</button>
              <button className="rounded-xl bg-cyan-500 px-3 py-2 font-semibold text-slate-950" onClick={() => {
                if (organizationModalMode === 'edit') {
                  updateOrganizationMutation.mutate(organizationForm);
                } else {
                  createOrganizationMutation.mutate(organizationForm);
                }
              }}>{organizationModalMode === 'edit' ? 'Save changes' : 'Create organization'}</button>
            </div>
          </div>
        </div>
      )}

      {showBillingModal && selectedOrganizationId && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">Billing</h3>
                <p className="text-sm text-slate-400">Select a plan, add payment details, and review invoices.</p>
              </div>
              <button className="rounded-full border border-slate-700 px-3 py-2 text-sm" onClick={() => setShowBillingModal(false)}>Close</button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-sm text-slate-400">Plans</p>
                <div className="mt-3 space-y-3">
                  {plans.map((plan) => (
                    <label key={plan.id} className="block rounded-2xl border border-slate-800 bg-slate-900 p-3">
                      <input type="radio" name="billingPlan" value={plan.id} className="mr-2" checked={selectedBillingPlanId === plan.id} onChange={(e) => setSelectedBillingPlanId(e.target.value)} />
                      <span className="font-medium">{plan.name}</span>
                      <p className="text-xs text-slate-400">{plan.description}</p>
                      <p className="text-xs text-slate-500">{(plan.priceCents / 100).toFixed(2)} {plan.currency.toUpperCase()} / {plan.interval}</p>
                    </label>
                  ))}
                </div>
                <button className="mt-4 w-full rounded-xl bg-cyan-500 px-3 py-2 font-semibold text-slate-950" disabled={!selectedBillingPlanId} onClick={() => createSubscriptionMutation.mutate(selectedBillingPlanId)}>Subscribe</button>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <p className="text-sm text-slate-400">Payment method</p>
                  <div className="mt-3 space-y-3">
                    <input className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2" placeholder="Card brand" value={paymentMethodForm.brand} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, brand: e.target.value })} />
                    <input className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2" placeholder="Last 4 digits" value={paymentMethodForm.last4} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, last4: e.target.value })} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <input className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2" placeholder="Expiry month" value={paymentMethodForm.expMonth} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, expMonth: e.target.value })} />
                      <input className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2" placeholder="Expiry year" value={paymentMethodForm.expYear} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, expYear: e.target.value })} />
                    </div>
                    <button className="w-full rounded-xl bg-cyan-500 px-3 py-2 font-semibold text-slate-950" onClick={() => addPaymentMethodMutation.mutate(paymentMethodForm)}>Save method</button>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <p className="text-sm text-slate-400">Invoices</p>
                  <div className="mt-3 space-y-2">
                    {organizationInvoices.length === 0 ? (
                      <p className="text-sm text-slate-400">No invoices yet.</p>
                    ) : organizationInvoices.map((invoice) => (
                      <div key={invoice.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-sm">
                        <div className="font-medium">{invoice.status.toUpperCase()}</div>
                        <div className="text-slate-400">{(invoice.amountCents / 100).toFixed(2)} {invoice.currency.toUpperCase()}</div>
                        <div className="text-xs text-slate-500">Due {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showWorkspaceSettingsModal && selectedWorkspace && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-xl font-semibold">Workspace settings</h3>
            <div className="mt-4 space-y-3">
              <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Workspace name" value={workspaceSettingsForm.name} onChange={(e) => setWorkspaceSettingsForm({ ...workspaceSettingsForm, name: e.target.value })} />
              <textarea className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Description" value={workspaceSettingsForm.description} onChange={(e) => setWorkspaceSettingsForm({ ...workspaceSettingsForm, description: e.target.value })} />
              <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Logo URL (optional)" value={workspaceSettingsForm.image} onChange={(e) => setWorkspaceSettingsForm({ ...workspaceSettingsForm, image: e.target.value })} />
              <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" value={workspaceSettingsForm.privacy} onChange={(e) => setWorkspaceSettingsForm({ ...workspaceSettingsForm, privacy: e.target.value })}>
                <option value="PUBLIC">Public</option>
                <option value="PRIVATE">Private</option>
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-700 px-3 py-2" onClick={() => setShowWorkspaceSettingsModal(false)}>Cancel</button>
              <button className="rounded-xl bg-cyan-500 px-3 py-2 font-semibold text-slate-950" onClick={() => updateWorkspaceMutation.mutate({ name: workspaceSettingsForm.name, description: workspaceSettingsForm.description, privacy: workspaceSettingsForm.privacy, image: workspaceSettingsForm.image, settings: workspaceSettingsForm.settings })}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showProjectModal && selectedWorkspace && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-xl font-semibold">Create project</h3>
            <div className="mt-4 space-y-3">
              <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Project name" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} />
              <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Project key" value={projectForm.key} onChange={(e) => setProjectForm({ ...projectForm, key: e.target.value })} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-700 px-3 py-2" onClick={() => setShowProjectModal(false)}>Cancel</button>
              <button className="rounded-xl bg-cyan-500 px-3 py-2 font-semibold text-slate-950 disabled:opacity-50" disabled={!projectForm.name.trim() || !projectForm.key.trim() || !selectedWorkspaceId} onClick={() => {
                if (!selectedWorkspaceId) {
                  toast.error('Select a workspace first');
                  return;
                }
                if (!projectForm.name.trim()) {
                  toast.error('Project name is required');
                  return;
                }
                if (!projectForm.key.trim()) {
                  toast.error('Project key is required');
                  return;
                }
                createProjectMutation.mutate({ workspaceId: selectedWorkspaceId, ...projectForm });
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showInviteModal && selectedWorkspace && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-xl font-semibold">Invite member</h3>
            <input className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Member email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            <div className="mt-6 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-700 px-3 py-2" onClick={() => setShowInviteModal(false)}>Cancel</button>
              <button className="rounded-xl bg-cyan-500 px-3 py-2 font-semibold text-slate-950" onClick={() => inviteWorkspaceMutation.mutate({ email: inviteEmail })}>Send invite</button>
            </div>
          </div>
        </div>
      )}

      {showProjectMembersModal && selectedProject && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold">Project members</h3>
              <button className="rounded-xl border border-slate-700 px-3 py-2" onClick={() => setShowProjectMembersModal(false)}>Close</button>
            </div>
            <input className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Search by name or email" value={projectMemberSearch} onChange={(e) => setProjectMemberSearch(e.target.value)} />
            <div className="mb-4 space-y-2">
              {(projectMembers || []).map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 p-3">
                  <div>
                    <p className="font-medium">{member.user?.username || member.user?.email}</p>
                    <p className="text-sm text-slate-400">{member.user?.email}</p>
                    <p className="text-xs text-slate-500">Role: {member.role} • {member.isOnline ? 'Online' : 'Offline'}</p>
                  </div>
                  <div className="flex gap-2">
                    <select className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-1" value={member.role} onChange={(e) => updateProjectMemberMutation.mutate({ projectId: selectedProject.id, memberId: member.id, role: e.target.value })}>
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                      <option value="OWNER">Owner</option>
                    </select>
                    <button className="rounded-xl border border-rose-700 px-2 py-1 text-xs text-rose-300" onClick={() => removeProjectMemberMutation.mutate({ projectId: selectedProject.id, memberId: member.id })}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
              <h4 className="mb-2 font-semibold">Invite workspace member</h4>
              <div className="flex gap-2">
                <input className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="User ID" value={projectMemberForm.userId} onChange={(e) => setProjectMemberForm({ ...projectMemberForm, userId: e.target.value })} />
                <select className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" value={projectMemberForm.role} onChange={(e) => setProjectMemberForm({ ...projectMemberForm, role: e.target.value })}>
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <button className="rounded-xl bg-cyan-500 px-3 py-2 font-semibold text-slate-950" onClick={() => addProjectMemberMutation.mutate({ projectId: selectedProject.id, payload: projectMemberForm })}>Add</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTaskModal && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-xl font-semibold">{editingTaskId ? 'Edit task' : 'Create task'}</h3>
            <div className="mt-4 space-y-3">
              <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Task title" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
              <textarea className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Description" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
              <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
              <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
              <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}>
                <option value="TODO">Todo</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="REVIEW">Review</option>
                <option value="COMPLETED">Completed</option>
              </select>
              <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" value={taskForm.groupId} onChange={(e) => setTaskForm({ ...taskForm, groupId: e.target.value })}>
                <option value="">No group</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
              <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" value={taskForm.projectId} onChange={(e) => setTaskForm({ ...taskForm, projectId: e.target.value, issueTypeId: '', parentId: '' })}>
                <option value="">No project</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" value={taskForm.issueTypeId} onChange={(e) => setTaskForm({ ...taskForm, issueTypeId: e.target.value })}>
                <option value="">No issue type</option>
                {issueTypes.map((issueType) => <option key={issueType.id} value={issueType.id}>{issueType.name}</option>)}
              </select>
              <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" value={taskForm.parentId} onChange={(e) => setTaskForm({ ...taskForm, parentId: e.target.value })}>
                <option value="">No parent task</option>
                {tasks
                  .filter((task) => task.project?.id === taskForm.projectId && task.id !== editingTaskId)
                  .map((task) => (
                    <option key={task.id} value={task.id}>{task.title}</option>
                  ))}
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-700 px-3 py-2" onClick={() => { setShowTaskModal(false); resetTaskForm(); }}>Cancel</button>
              <button className="rounded-xl bg-cyan-500 px-3 py-2 font-semibold text-slate-950" onClick={() => {
                if (taskForm.title) {
                  if (editingTaskId) {
                    updateTaskMutation.mutate({ id: editingTaskId, payload: taskForm });
                  } else {
                    createTaskMutation.mutate(taskForm);
                  }
                }
              }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const initialize = async () => {
    const token = getStoredToken();

    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      try {
        const res = await api.get('/users/me');
        setUser(res.data.user);
        setLoading(false);
        return;
      } catch {
        // fall through to refresh cookie attempt
      }
    }

    try {
      const refreshRes = await api.post('/auth/refresh', { refreshToken: getStoredRefreshToken() });
      const refreshToken = refreshRes.data.refreshToken || getStoredRefreshToken();
      setStoredToken(refreshRes.data.accessToken, localStorage.getItem('rememberMe') === 'true');
      setStoredRefreshToken(refreshToken, localStorage.getItem('rememberMe') === 'true');
      api.defaults.headers.common.Authorization = `Bearer ${refreshRes.data.accessToken}`;
      setUser(refreshRes.data.user);
    } catch {
      clearStoredToken();
      delete api.defaults.headers.common.Authorization;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initialize();
  }, []);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">Loading workspace...</div>;
  }

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage onAuthenticated={setUser} />} />
      <Route path="/dashboard" element={user ? <DashboardPage user={user} onLogout={() => setUser(null)} /> : <Navigate to="/" replace />} />
    </Routes>
  );
}
