import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SpeakerNotesOffIcon from "@mui/icons-material/SpeakerNotesOff";
import {
	Alert,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	Tab,
	Tabs,
	Tooltip,
	Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import type { RawLyricData } from "@/store";
import { copyTextToClipboard } from "@/utils/clipboard";

export interface RawLyricViewerDialogProps {
	open: boolean;
	onClose: () => void;
	content: RawLyricData | null;
}

export function RawLyricViewerDialog({
	open,
	onClose,
	content,
}: RawLyricViewerDialogProps) {
	const [tabIndex, setTabIndex] = useState(0);
	const [copySuccess, setCopySuccess] = useState(false);

	useEffect(() => {
		if (open) {
			setTabIndex(0);
			setCopySuccess(false);
		}
	}, [open]);

	const availableTabs: { label: string; text: string }[] = [];
	if (content?.main)
		availableTabs.push({ label: "主歌词", text: content.main });
	if (content?.trans)
		availableTabs.push({ label: "翻译", text: content.trans });
	if (content?.roma)
		availableTabs.push({ label: "罗马音", text: content.roma });

	const safeTabIndex = Math.min(
		tabIndex,
		Math.max(0, availableTabs.length - 1),
	);
	const currentTab = availableTabs[safeTabIndex];

	const handleCopy = async () => {
		if (currentTab?.text) {
			const success = await copyTextToClipboard(currentTab.text);
			if (success) {
				setCopySuccess(true);
				setTimeout(() => setCopySuccess(false), 2000);
			}
		}
	};

	const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
		setTabIndex(newValue);
		setCopySuccess(false);
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			fullWidth
			maxWidth="md"
			slotProps={{
				paper: {
					sx: { borderRadius: 2 },
				},
			}}
		>
			<DialogTitle sx={{ fontWeight: "bold", pb: 1.5 }}>
				查看原始歌词
			</DialogTitle>

			<DialogContent
				dividers
				sx={{ display: "flex", flexDirection: "column", p: 0 }}
			>
				{content?.scrollable === false && (
					<Alert
						severity="info"
						sx={{
							borderRadius: 0,
							borderBottom: 1,
							borderColor: "divider",
							py: 0.5,
						}}
					>
						当前歌曲无滚动歌词
					</Alert>
				)}

				{availableTabs.length > 0 ? (
					<>
						<Box
							sx={{
								borderBottom: 1,
								borderColor: "divider",
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								bgcolor: "background.paper",
								pl: 1,
								pr: 1.5,
							}}
						>
							<Tabs
								value={safeTabIndex}
								onChange={handleTabChange}
								variant="scrollable"
								scrollButtons="auto"
								sx={{ flex: 1, minHeight: 48 }}
							>
								{availableTabs.map((tab) => (
									<Tab
										key={tab.label}
										label={tab.label}
										sx={{ minHeight: 48, fontWeight: 500 }}
									/>
								))}
							</Tabs>

							<Tooltip title={copySuccess ? "已复制" : "复制"} placement="left">
								<IconButton
									onClick={handleCopy}
									size="small"
									color={copySuccess ? "success" : "primary"}
									sx={{
										transition: "all 0.2s ease-in-out",
										bgcolor: copySuccess ? "success.50" : "transparent",
									}}
								>
									{copySuccess ? (
										<CheckIcon fontSize="small" />
									) : (
										<ContentCopyIcon fontSize="small" />
									)}
								</IconButton>
							</Tooltip>
						</Box>

						<Box
							sx={{
								p: 2.5,
								flex: 1,
								overflowY: "auto",
								bgcolor: "background.default",
							}}
						>
							<Box
								component="pre"
								sx={{
									m: 0,
									p: 2.5,
									borderRadius: 2,
									bgcolor: "background.paper",
									border: "1px solid",
									borderColor: "divider",
									whiteSpace: "pre-wrap",
									wordBreak: "break-all",
									fontFamily: "monospace",
									fontSize: "0.875rem",
									lineHeight: 1.8,
									color: "text.primary",
									userSelect: "text",
									WebkitUserSelect: "text",
								}}
							>
								{currentTab.text}
							</Box>
						</Box>
					</>
				) : (
					<Box
						sx={{
							display: "flex",
							flexDirection: "column",
							justifyContent: "center",
							alignItems: "center",
							minHeight: "250px",
							gap: 2,
							color: "text.disabled",
							bgcolor: "background.default",
						}}
					>
						<SpeakerNotesOffIcon sx={{ fontSize: 48, opacity: 0.6 }} />
						<Typography variant="body1">暂无歌词数据</Typography>
					</Box>
				)}
			</DialogContent>

			<DialogActions sx={{ px: 2.5, py: 1.5 }}>
				<Button onClick={onClose} variant="outlined" color="inherit">
					关闭
				</Button>
			</DialogActions>
		</Dialog>
	);
}
