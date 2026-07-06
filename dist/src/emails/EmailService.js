import { emailProvider } from "./EmailProvider.js";
import { emailTemplateDefinitions } from "./templates/index.js";
import { settingsService } from "../services/settings-service.js";
import { env } from "../utils/env.js";
import { logger } from "../utils/logger.js";
const normalizeEmailAddresses = (input) => {
    const addresses = Array.isArray(input) ? input : [input];
    return addresses.map((address) => typeof address === "string" ? address : address.email);
};
const formatSenderAddress = (brand) => {
    return {
        email: brand.senderEmail,
        name: brand.senderName,
    };
};
const isTemplateRequest = (request) => {
    return "template" in request;
};
const getTemplateDefinition = (templateName) => {
    return emailTemplateDefinitions[templateName];
};
/**
 * Central email service used by all modules to render and send emails safely.
 */
export class EmailService {
    /**
     * Sends a fully rendered email message.
     */
    async sendEmail(request) {
        try {
            const brand = await this.getBrandingSettings();
            const result = await emailProvider.send({
                ...request,
                from: formatSenderAddress(brand),
            });
            logger.info(result.providerMode === "json"
                ? "Email captured by JSON transport."
                : "Email sent successfully.", {
                accepted: result.accepted,
                messageId: result.messageId,
                providerMode: result.providerMode,
                rejected: result.rejected,
                subject: request.subject,
                to: normalizeEmailAddresses(request.to),
            });
            return {
                ...result,
                subject: request.subject,
                success: true,
                to: normalizeEmailAddresses(request.to),
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown email delivery error";
            logger.error("Email send failed.", {
                message,
                providerMode: emailProvider.mode,
                subject: request.subject,
                to: normalizeEmailAddresses(request.to),
            });
            return {
                accepted: [],
                error: message,
                providerMode: emailProvider.mode,
                rejected: normalizeEmailAddresses(request.to),
                subject: request.subject,
                success: false,
                to: normalizeEmailAddresses(request.to),
            };
        }
    }
    /**
     * Renders a named template and sends it using the configured provider.
     */
    async sendTemplate(request) {
        try {
            const rendered = await this.renderTemplate(request.template, request.variables);
            const emailRequest = {
                html: rendered.html,
                subject: rendered.subject,
                text: rendered.text,
                to: request.to,
            };
            if (request.bcc) {
                emailRequest.bcc = request.bcc;
            }
            if (request.cc) {
                emailRequest.cc = request.cc;
            }
            if (request.headers) {
                emailRequest.headers = request.headers;
            }
            if (request.replyTo) {
                emailRequest.replyTo = request.replyTo;
            }
            const result = await this.sendEmail(emailRequest);
            if (!result.success) {
                logger.error("Email template delivery failed.", {
                    accepted: result.accepted,
                    error: result.error,
                    providerMode: result.providerMode,
                    rejected: result.rejected,
                    subject: result.subject,
                    template: request.template,
                    to: result.to,
                });
            }
            return result;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown email template error";
            logger.error("Email template send failed.", {
                message,
                providerMode: emailProvider.mode,
                template: request.template,
                to: normalizeEmailAddresses(request.to),
            });
            return {
                accepted: [],
                error: message,
                providerMode: emailProvider.mode,
                rejected: normalizeEmailAddresses(request.to),
                subject: `Template: ${request.template}`,
                success: false,
                to: normalizeEmailAddresses(request.to),
            };
        }
    }
    /**
     * Sends multiple email requests without failing the entire operation on individual errors.
     */
    async sendBulk(requests) {
        const results = await Promise.all(requests.map((request) => isTemplateRequest(request) ? this.sendTemplate(request) : this.sendEmail(request)));
        const sentCount = results.filter((result) => result.success).length;
        const failedCount = results.length - sentCount;
        return {
            failedCount,
            results,
            sentCount,
            success: failedCount === 0,
            total: results.length,
        };
    }
    /**
     * Verifies the email transport connection without throwing application-level errors.
     */
    async verifyConnection() {
        try {
            return await emailProvider.verifyConnection();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown email connection error";
            logger.error("Email provider verification failed.", {
                message,
            });
            return {
                error: message,
                providerMode: emailProvider.mode,
                success: false,
            };
        }
    }
    /**
     * Renders a template with current branding settings for previews and delivery.
     */
    async renderTemplate(templateName, variables) {
        const brand = await this.getBrandingSettings();
        const definition = getTemplateDefinition(templateName);
        return definition.render({
            brand,
            variables,
        });
    }
    async getBrandingSettings() {
        try {
            return await settingsService.getEmailBrandingSettings();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown settings lookup error";
            logger.warn("Settings lookup failed. Falling back to environment email configuration.", {
                message,
            });
            return {
                appName: env.APP_NAME,
                logoUrl: null,
                primaryColor: "#1f2937",
                senderEmail: env.SMTP_FROM_EMAIL,
                senderName: env.SMTP_FROM_NAME,
                supportEmail: env.SMTP_FROM_EMAIL,
            };
        }
    }
}
export const emailService = new EmailService();
//# sourceMappingURL=EmailService.js.map