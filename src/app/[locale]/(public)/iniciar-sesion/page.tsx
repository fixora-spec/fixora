import {
  ApplicationBootstrap,
} from "@/components/organisms/application-bootstrap";

export default function SignInPage() {
  return (
    <ApplicationBootstrap
      preloaderCompleted
      automaticAuthenticationEnabled
    />
  );
}