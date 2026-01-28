/**
 * 커스텀 이벤트 타입 정의 템플릿
 *
 * DOM/React 이벤트는 내장 타입 사용:
 * - DOM: MouseEvent, KeyboardEvent, FocusEvent, Event 등 (lib: ["DOM"])
 * - React: import type { MouseEvent, ChangeEvent, FormEvent } from "react"
 *
 * 이 파일에는 프로젝트 전용 커스텀 이벤트 패턴만 정의.
 */

// 프로젝트별 CustomEvent 맵 (이름/페이로드 수정해서 사용)
export interface CustomEventMap {
  "user-login": CustomEvent<{ userId: string; timestamp: number }>;
  "user-logout": CustomEvent<{ userId: string }>;
  "data-updated": CustomEvent<{ resource: string; id: string }>;
}

export type CustomEventListener<K extends keyof CustomEventMap> = (
  event: CustomEventMap[K]
) => void;

// 이벤트 에미터 타입 (커스텀 이벤트 버스 등)
export interface EventEmitter<T extends Record<string, unknown>> {
  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): void;
  off<K extends keyof T>(event: K, listener: (data: T[K]) => void): void;
  emit<K extends keyof T>(event: K, data: T[K]): void;
}

// 예시: 앱 이벤트 페이로드 타입
export interface AppEvents {
  "user:login": { userId: string; timestamp: number };
  "user:logout": { userId: string };
  "data:updated": { resource: string; id: string };
}
