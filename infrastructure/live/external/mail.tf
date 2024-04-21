# Copyright 2024
#
# Everyone is permitted to copy, distribute, modify, merge, sell, publish,
# sublicense or whatever the fuck they want with this software but at their
# OWN RISK.
# The author has absolutely no fucking clue what the code in this project
# does. It might just fucking work or not, there is no third option.
#
# IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
# FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
# DEALINGS IN THE SOFTWARE.
# ---
#
# This document manages the SMTP service used by chezmoi.sh to send notifications.

# -<SES configuration>----------------------------------------------------------
resource "aws_ses_email_identity" "noreply" {
  email = "noreply@${var.dns_zone}"
}

resource "aws_ses_email_identity" "allowed_identities" {
  for_each = toset(var.allowed_identities)

  email = each.key
}

# -<SES IAM configuration>------------------------------------------------------
# --<Policies configuration>----------------------------------------------------
data "aws_iam_policy_document" "transaction_mailer" {
  statement {
    actions = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = concat(
      [aws_ses_email_identity.noreply.arn],
      [for _, id in aws_ses_email_identity.allowed_identities : id.arn],
    )

    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = ["noreply@${var.dns_zone}"]
    }
  }
}

resource "aws_iam_policy" "ses_transaction_mailer" {
  name = "SESTransactionMailer"

  path   = "/chezmoi.sh/nex.rpi/"
  policy = data.aws_iam_policy_document.transaction_mailer.json
}

# --<User configuration>--------------------------------------------------------
# trunk-ignore(trivy/AVD-AWS-0123): MFA is overkill for this use case
resource "aws_iam_group" "transaction_mailer" {
  name = "TransactionMailerGroup"

  path = "/chezmoi.sh/nex.rpi/"
}

resource "aws_iam_group_policy_attachment" "transaction_mailer" {
  group      = aws_iam_group.transaction_mailer.name
  policy_arn = aws_iam_policy.ses_transaction_mailer.arn
}

# trunk-ignore(checkov/CKV_AWS_273): using a SSO is not possible in my case
resource "aws_iam_user" "transaction_mailer" {
  name = "TransactionMailerUser"

  path = "/chezmoi.sh/nex.rpi/"
}

resource "aws_iam_access_key" "transaction_mailer" {
  user = aws_iam_user.transaction_mailer.name
}

resource "aws_iam_user_group_membership" "transaction_mailer" {
  user   = aws_iam_user.transaction_mailer.name
  groups = [aws_iam_group.transaction_mailer.name]
}

# -<SES SMTP credentials>-------------------------------------------------------
output "ses_smtp_username" {
  value     = aws_iam_access_key.transaction_mailer.id
  sensitive = true
}

output "ses_smtp_password" {
  value     = aws_iam_access_key.transaction_mailer.ses_smtp_password_v4
  sensitive = true
}
