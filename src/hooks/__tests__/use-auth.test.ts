import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";
import * as actions from "@/actions";
import * as anonWorkTracker from "@/lib/anon-work-tracker";
import * as getProjectsAction from "@/actions/get-projects";
import * as createProjectAction from "@/actions/create-project";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anonWorkTracker.getAnonWorkData).mockReturnValue(null);
    vi.mocked(getProjectsAction.getProjects).mockResolvedValue([]);
    vi.mocked(createProjectAction.createProject).mockResolvedValue({
      id: "new-project-id",
      name: "New Design",
      userId: "user-1",
      messages: "[]",
      data: "{}",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  test("returns initial state", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoading).toBe(false);
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
  });

  describe("signIn", () => {
    test("returns success result and redirects to existing project", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({ success: true });
      vi.mocked(getProjectsAction.getProjects).mockResolvedValue([
        { id: "existing-project", name: "My Project", createdAt: new Date(), updatedAt: new Date() },
      ]);

      const { result } = renderHook(() => useAuth());

      let returnValue: any;
      await act(async () => {
        returnValue = await result.current.signIn("user@example.com", "password123");
      });

      expect(returnValue).toEqual({ success: true });
      expect(mockPush).toHaveBeenCalledWith("/existing-project");
    });

    test("creates a new project when no existing projects", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({ success: true });
      vi.mocked(getProjectsAction.getProjects).mockResolvedValue([]);
      vi.mocked(createProjectAction.createProject).mockResolvedValue({
        id: "brand-new-project",
        name: "New Design",
        userId: "user-1",
        messages: "[]",
        data: "{}",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(createProjectAction.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ messages: [], data: {} })
      );
      expect(mockPush).toHaveBeenCalledWith("/brand-new-project");
    });

    test("migrates anonymous work into a new project on sign in", async () => {
      const anonMessages = [{ id: "m1", role: "user", content: "Hello" }];
      const anonFileSystemData = { "/App.jsx": { type: "file", content: "export default () => null" } };

      vi.mocked(actions.signIn).mockResolvedValue({ success: true });
      vi.mocked(anonWorkTracker.getAnonWorkData).mockReturnValue({
        messages: anonMessages,
        fileSystemData: anonFileSystemData,
      });
      vi.mocked(createProjectAction.createProject).mockResolvedValue({
        id: "migrated-project",
        name: "Design from ...",
        userId: "user-1",
        messages: JSON.stringify(anonMessages),
        data: JSON.stringify(anonFileSystemData),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(createProjectAction.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: anonMessages,
          data: anonFileSystemData,
        })
      );
      expect(anonWorkTracker.clearAnonWork).toHaveBeenCalled();
      expect(getProjectsAction.getProjects).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/migrated-project");
    });

    test("skips anon work migration when messages array is empty", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({ success: true });
      vi.mocked(anonWorkTracker.getAnonWorkData).mockReturnValue({
        messages: [],
        fileSystemData: {},
      });
      vi.mocked(getProjectsAction.getProjects).mockResolvedValue([
        { id: "fallback-project", name: "Old", createdAt: new Date(), updatedAt: new Date() },
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(createProjectAction.createProject).not.toHaveBeenCalled();
      expect(anonWorkTracker.clearAnonWork).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/fallback-project");
    });

    test("returns error result and does not navigate on failure", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({
        success: false,
        error: "Invalid credentials",
      });

      const { result } = renderHook(() => useAuth());

      let returnValue: any;
      await act(async () => {
        returnValue = await result.current.signIn("user@example.com", "wrongpassword");
      });

      expect(returnValue).toEqual({ success: false, error: "Invalid credentials" });
      expect(mockPush).not.toHaveBeenCalled();
      expect(getProjectsAction.getProjects).not.toHaveBeenCalled();
    });

    test("sets isLoading to true during sign in and false when done", async () => {
      let resolveSignIn!: (value: any) => void;
      vi.mocked(actions.signIn).mockReturnValue(
        new Promise((resolve) => { resolveSignIn = resolve; })
      );
      vi.mocked(getProjectsAction.getProjects).mockResolvedValue([]);

      const { result } = renderHook(() => useAuth());

      expect(result.current.isLoading).toBe(false);

      let signInPromise: Promise<any>;
      act(() => {
        signInPromise = result.current.signIn("user@example.com", "password123");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignIn({ success: false, error: "fail" });
        await signInPromise!;
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("resets isLoading to false even when sign in throws", async () => {
      vi.mocked(actions.signIn).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await expect(result.current.signIn("user@example.com", "password123")).rejects.toThrow(
          "Network error"
        );
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("calls signIn action with correct credentials", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({ success: false, error: "fail" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("test@test.com", "mypassword");
      });

      expect(actions.signIn).toHaveBeenCalledWith("test@test.com", "mypassword");
    });
  });

  describe("signUp", () => {
    test("returns success result and redirects to existing project", async () => {
      vi.mocked(actions.signUp).mockResolvedValue({ success: true });
      vi.mocked(getProjectsAction.getProjects).mockResolvedValue([
        { id: "first-project", name: "First", createdAt: new Date(), updatedAt: new Date() },
      ]);

      const { result } = renderHook(() => useAuth());

      let returnValue: any;
      await act(async () => {
        returnValue = await result.current.signUp("new@example.com", "password123");
      });

      expect(returnValue).toEqual({ success: true });
      expect(mockPush).toHaveBeenCalledWith("/first-project");
    });

    test("creates a new project when no existing projects", async () => {
      vi.mocked(actions.signUp).mockResolvedValue({ success: true });
      vi.mocked(getProjectsAction.getProjects).mockResolvedValue([]);
      vi.mocked(createProjectAction.createProject).mockResolvedValue({
        id: "signup-project",
        name: "New Design",
        userId: "user-2",
        messages: "[]",
        data: "{}",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@example.com", "password123");
      });

      expect(createProjectAction.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ messages: [], data: {} })
      );
      expect(mockPush).toHaveBeenCalledWith("/signup-project");
    });

    test("migrates anonymous work on sign up", async () => {
      const anonMessages = [{ id: "m1", role: "user", content: "Build me a button" }];
      vi.mocked(actions.signUp).mockResolvedValue({ success: true });
      vi.mocked(anonWorkTracker.getAnonWorkData).mockReturnValue({
        messages: anonMessages,
        fileSystemData: {},
      });
      vi.mocked(createProjectAction.createProject).mockResolvedValue({
        id: "anon-signup-project",
        name: "Design from ...",
        userId: "user-2",
        messages: JSON.stringify(anonMessages),
        data: "{}",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@example.com", "password123");
      });

      expect(anonWorkTracker.clearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/anon-signup-project");
    });

    test("returns error result and does not navigate on failure", async () => {
      vi.mocked(actions.signUp).mockResolvedValue({
        success: false,
        error: "Email already registered",
      });

      const { result } = renderHook(() => useAuth());

      let returnValue: any;
      await act(async () => {
        returnValue = await result.current.signUp("existing@example.com", "password123");
      });

      expect(returnValue).toEqual({ success: false, error: "Email already registered" });
      expect(mockPush).not.toHaveBeenCalled();
    });

    test("sets isLoading to true during sign up and false when done", async () => {
      let resolveSignUp!: (value: any) => void;
      vi.mocked(actions.signUp).mockReturnValue(
        new Promise((resolve) => { resolveSignUp = resolve; })
      );
      vi.mocked(getProjectsAction.getProjects).mockResolvedValue([]);

      const { result } = renderHook(() => useAuth());

      expect(result.current.isLoading).toBe(false);

      let signUpPromise: Promise<any>;
      act(() => {
        signUpPromise = result.current.signUp("new@example.com", "password123");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignUp({ success: false, error: "fail" });
        await signUpPromise!;
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("resets isLoading to false even when sign up throws", async () => {
      vi.mocked(actions.signUp).mockRejectedValue(new Error("Server error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await expect(result.current.signUp("new@example.com", "password123")).rejects.toThrow(
          "Server error"
        );
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("calls signUp action with correct credentials", async () => {
      vi.mocked(actions.signUp).mockResolvedValue({ success: false, error: "fail" });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@test.com", "securepass");
      });

      expect(actions.signUp).toHaveBeenCalledWith("new@test.com", "securepass");
    });
  });
});
